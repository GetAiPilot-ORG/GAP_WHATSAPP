-- Update WhatsApp subscription plan contact limits:
-- Starter (₹999): 2,000 contacts (previously 1,000)
-- Growth (₹1,999): 10,000 contacts (unchanged)
-- Pro (₹3,499): 25,000 contacts (previously 50,000)

UPDATE public.whatsapp_subscription_plans
SET 
  limits = jsonb_set(limits, '{contacts}', '2000'::jsonb),
  features = '["1 WhatsApp number","2,000 contacts","5 automation flows","Manual broadcasts","Basic bot replies","Standard support"]'::jsonb,
  updated_at = now()
WHERE id = 'starter';

UPDATE public.whatsapp_subscription_plans
SET 
  limits = jsonb_set(limits, '{contacts}', '10000'::jsonb),
  features = '["10,000 contacts","5 agents included","Unlimited flows","Broadcast campaigns","Tags and attributes","Message spend dashboard","Basic analytics"]'::jsonb,
  updated_at = now()
WHERE id = 'growth';

UPDATE public.whatsapp_subscription_plans
SET 
  limits = jsonb_set(limits, '{contacts}', '25000'::jsonb),
  features = '["2 WhatsApp numbers","25,000 contacts","10 agents included","Campaign scheduler","Advanced AI bot","Reports and CSV export","API and webhooks"]'::jsonb,
  updated_at = now()
WHERE id = 'pro';

-- Also update public.pricing_plans table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pricing_plans') THEN
    UPDATE public.pricing_plans
    SET 
      features = '["1 WhatsApp number","2,000 contacts","5 automation flows","Manual broadcasts","Basic bot replies"]'::jsonb,
      updated_at = now()
    WHERE plan_name IN ('whatsapp_starter_monthly', 'whatsapp_starter_yearly');

    UPDATE public.pricing_plans
    SET 
      features = '["2 WhatsApp numbers","25,000 contacts","10 agents included","Campaign scheduler","API and webhooks"]'::jsonb,
      updated_at = now()
    WHERE plan_name IN ('whatsapp_pro_monthly', 'whatsapp_pro_yearly');
  END IF;
END $$;
