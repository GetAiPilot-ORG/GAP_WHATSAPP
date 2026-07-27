-- Ensure the idempotency_key column exists
ALTER TABLE public.whatsapp_wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Create the unique index on idempotency_key if it is missing
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_wallet_transactions_idempotency
  ON public.whatsapp_wallet_transactions(idempotency_key);

-- Drop existing check constraint on whatsapp_wallet_transactions type safely
DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.whatsapp_wallet_transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type%'
    AND pg_get_constraintdef(oid) ILIKE '%message_debit%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.whatsapp_wallet_transactions DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Re-create constraint including 'message_refund'
ALTER TABLE public.whatsapp_wallet_transactions
  ADD CONSTRAINT whatsapp_wallet_transactions_type_check
  CHECK (type IN (
    'recharge', 'message_debit', 'refund', 'adjustment', 'failed_debit',
    'campaign_reserve', 'campaign_release', 'campaign_settlement', 'message_refund'
  ));

-- Define safe, atomic, idempotent refund function
CREATE OR REPLACE FUNCTION public.refund_whatsapp_message(p_wa_message_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_message_id UUID;
  v_organization_id UUID;
  v_billing_status TEXT;
  v_campaign_id UUID;
  v_failure_reason TEXT;
  v_debit_tx RECORD;
  v_balance BIGINT;
  v_refund_amount BIGINT;
  v_wallet RECORD;
  v_refund_tx_id UUID;
  v_recipient_billing_status TEXT;
BEGIN
  -- 1. Check if campaign recipient was already refunded
  SELECT billing_status INTO v_recipient_billing_status
  FROM public.w_campaign_recipients
  WHERE wa_message_id = p_wa_message_id;

  IF FOUND AND v_recipient_billing_status = 'refunded' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_refunded_recipient');
  END IF;

  -- 2. Resolve target message by Meta wamid
  SELECT id, organization_id, billing_status, (metadata->>'campaign_id')::uuid, metadata->>'last_meta_error'
  INTO v_message_id, v_organization_id, v_billing_status, v_campaign_id, v_failure_reason
  FROM public.w_messages
  WHERE wa_message_id = p_wa_message_id;

  IF NOT FOUND THEN
    SELECT message_id, organization_id, billing_status, campaign_id, NULL
    INTO v_message_id, v_organization_id, v_billing_status, v_campaign_id, v_failure_reason
    FROM public.whatsapp_message_usage_logs
    WHERE wa_message_id = p_wa_message_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'reason', 'message_not_found');
    END IF;
  END IF;

  -- 3. Lock organization's wallet using FOR UPDATE
  SELECT * INTO v_wallet
  FROM public.whatsapp_wallets
  WHERE organization_id = v_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wallet_not_found');
  END IF;

  -- 4. Re-verify billing state after acquiring lock (Idempotency Check A)
  -- Querying from whatsapp_message_usage_logs since it is guaranteed to have a bridge row for any charged message
  SELECT billing_status INTO v_billing_status
  FROM public.whatsapp_message_usage_logs
  WHERE message_id = v_message_id;

  IF v_billing_status = 'refunded' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_refunded_status');
  END IF;

  -- 5. Find the original message_debit transaction (No fallbacks allowed)
  SELECT id, amount_paise
  INTO v_debit_tx
  FROM public.whatsapp_wallet_transactions
  WHERE organization_id = v_organization_id
    AND reference_id = v_message_id::text
    AND type = 'message_debit'
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'original_debit_not_found');
  END IF;

  v_refund_amount := abs(v_debit_tx.amount_paise);
  IF v_refund_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'zero_debit_amount');
  END IF;

  -- 6. Claim idempotency by inserting the refund transaction first (Idempotency Check B)
  INSERT INTO public.whatsapp_wallet_transactions (
    organization_id, type, amount_paise, balance_after_paise, currency, status,
    reference_type, reference_id, description, metadata, idempotency_key
  ) VALUES (
    v_organization_id, 'message_refund', v_refund_amount,
    NULL, 'INR', 'completed', 'message', v_message_id::text,
    'Refund for failed WhatsApp message',
    jsonb_build_object(
      'campaign_id', v_campaign_id,
      'wa_message_id', p_wa_message_id,
      'original_debit_id', v_debit_tx.id,
      'failure_reason', v_failure_reason
    ),
    'message-refund-' || p_wa_message_id
  ) ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_refund_tx_id;

  IF v_refund_tx_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_refunded_idempotency');
  END IF;

  -- 7. Credit wallet balance
  UPDATE public.whatsapp_wallets
  SET balance_paise = balance_paise + v_refund_amount,
      updated_at = now()
  WHERE organization_id = v_organization_id
  RETURNING balance_paise INTO v_balance;

  -- 8. Update balance_after_paise on the new ledger record
  UPDATE public.whatsapp_wallet_transactions
  SET balance_after_paise = v_balance
  WHERE id = v_refund_tx_id;

  -- 9. Mark w_messages billing status as refunded
  UPDATE public.w_messages
  SET billing_status = 'refunded'
  WHERE id = v_message_id;

  -- 10. Mark usage logs billing status as refunded (preserve charged_amount_paise)
  UPDATE public.whatsapp_message_usage_logs
  SET billing_status = 'refunded',
      updated_at = now()
  WHERE message_id = v_message_id;

  -- 11. Mark recipient billing status as refunded if exists, setting refunded_paise strictly equal to v_refund_amount
  UPDATE public.w_campaign_recipients
  SET billing_status = 'refunded',
      status = 'failed',
      refunded_paise = v_refund_amount,
      updated_at = now()
  WHERE wa_message_id = p_wa_message_id;

  RETURN jsonb_build_object(
    'success', true,
    'refunded_amount', v_refund_amount,
    'new_balance', v_balance,
    'transaction_id', v_refund_tx_id
  );
END;
$$;
