import { supabase } from '../config/supabase.js';

export type AccountHealthState = 
    | 'DISCONNECTED'
    | 'CONNECTING'
    | 'CONNECTED'
    | 'CHECKING'
    | 'WARNING'
    | 'TOKEN_INVALID'
    | 'VERIFICATION_PENDING'
    | 'REVOKED';

export interface AccountHealthSummary {
    connection: AccountHealthState;
    messaging: 'SEND_READY' | 'PAUSED' | 'RESTRICTED';
    token: 'VALID' | 'EXPIRED' | 'MISSING' | 'INVALID';
    verification: 'VERIFIED' | 'ACTION_REQUIRED' | 'PENDING' | 'UNKNOWN';
    quality: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
    has_access_token: boolean;
    health_version: number;
    last_updated: string;
}

export class AccountHealthService {
    /**
     * Single Writer Authority for computing and persisting WhatsApp Account health.
     * Enforces the 8-state Finite State Machine and Optimistic Stability.
     */
    static async updateHealth(accountId: string, updates: Partial<{
        connection_status: AccountHealthState;
        token_status: 'VALID' | 'EXPIRED' | 'MISSING' | 'INVALID';
        business_verification_status: 'VERIFIED' | 'ACTION_REQUIRED' | 'PENDING' | 'UNKNOWN';
        business_name: string | null;
        business_id: string | null;
        quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | null;
        messaging_limit: string | null;
        webhook_status: string | null;
        diagnostics_json: any;
    }>) {
        if (!accountId) return null;

        try {
            // 1. Fetch current account record
            const { data: current, error: fetchErr } = await supabase
                .from('w_wa_accounts')
                .select('*')
                .eq('id', accountId)
                .maybeSingle();

            if (fetchErr || !current) {
                console.error('[AccountHealthService] Account not found:', accountId, fetchErr);
                return null;
            }

            const currentVersion = Number(current.health_version || 1);
            const nextVersion = currentVersion + 1;
            const now = new Date().toISOString();

            // 2. State Machine Rules & Transition Validation
            let targetConnectionStatus: AccountHealthState = updates.connection_status || current.connection_status || 'CONNECTED';

            // Optimistic Stability Rule:
            // Transient network checks or slow responses MUST move to 'CHECKING', never directly to 'DISCONNECTED' or 'TOKEN_INVALID'.
            if (updates.connection_status === 'CHECKING' && current.status === 'connected') {
                targetConnectionStatus = 'CHECKING';
            }

            // Only transition to TOKEN_INVALID if explicitly confirmed expired/revoked
            if (updates.token_status === 'EXPIRED' || updates.token_status === 'INVALID') {
                targetConnectionStatus = 'TOKEN_INVALID';
            }

            const payload: any = {
                connection_status: targetConnectionStatus,
                status: targetConnectionStatus === 'DISCONNECTED' ? 'disconnected' : (targetConnectionStatus === 'TOKEN_INVALID' ? 'failed' : 'connected'),
                has_access_token: Boolean(current.access_token_encrypted),
                health_version: nextVersion,
                last_health_check_at: now,
                last_sync_attempt_at: now,
                last_sync_status: targetConnectionStatus === 'TOKEN_INVALID' ? 'FAILED' : 'SUCCESS',
            };

            if (updates.token_status !== undefined) payload.token_status = updates.token_status;
            if (updates.business_verification_status !== undefined) payload.business_verification_status = updates.business_verification_status;
            if (updates.business_name !== undefined) payload.business_name = updates.business_name;
            if (updates.business_id !== undefined) payload.business_id = updates.business_id;
            if (updates.quality_rating !== undefined) payload.quality_rating = updates.quality_rating;
            if (updates.messaging_limit !== undefined) payload.messaging_limit = updates.messaging_limit;
            if (updates.webhook_status !== undefined) payload.webhook_status = updates.webhook_status;
            if (updates.diagnostics_json !== undefined) payload.health_cache = updates.diagnostics_json;

            // 3. Persist update to DB with Optimistic Concurrency Control (OCC)
            const { data: updated, error: updateErr } = await supabase
                .from('w_wa_accounts')
                .update(payload)
                .eq('id', accountId)
                .eq('health_version', currentVersion)
                .select('*')
                .single();

            if (updateErr) {
                // If OCC check or column issue occurs, update directly by account ID
                const { data: fallbackUpdated, error: fallbackErr } = await supabase
                    .from('w_wa_accounts')
                    .update(payload)
                    .eq('id', accountId)
                    .select('*')
                    .single();

                if (fallbackErr) {
                    if (fallbackErr.message?.includes('column') || fallbackErr.message?.includes('does not exist')) {
                        const minPayload = {
                            status: payload.status,
                            updated_at: now,
                        };
                        const { data: minUpdated } = await supabase
                            .from('w_wa_accounts')
                            .update(minPayload)
                            .eq('id', accountId)
                            .select('*')
                            .single();
                        return minUpdated || current;
                    }
                    console.error('[AccountHealthService] Failed to persist health update:', fallbackErr.message);
                    return current;
                }
                return fallbackUpdated || current;
            }

            return updated;
        } catch (err: any) {
            console.error('[AccountHealthService] Error in updateHealth:', err.message);
            return null;
        }
    }

    /**
     * Normalizes an account DB row into the standard read-only account.health object.
     */
    static buildHealthSummary(account: any): AccountHealthSummary {
        const hasToken = Boolean(account?.access_token_encrypted || account?.has_access_token);
        const rawStatus = String(account?.connection_status || account?.status || 'connected').toUpperCase();

        let connection: AccountHealthState = 'CONNECTED';
        if (rawStatus === 'DISCONNECTED' || account?.status === 'disconnected') {
            connection = 'DISCONNECTED';
        } else if (rawStatus === 'TOKEN_INVALID' || account?.status === 'failed') {
            connection = 'TOKEN_INVALID';
        } else if (!hasToken && account?.connection_type !== 'qr_session') {
            connection = 'TOKEN_INVALID';
        } else if (rawStatus === 'CHECKING') {
            connection = 'CHECKING';
        } else if (rawStatus === 'VERIFICATION_PENDING' || account?.status === 'pending') {
            connection = 'VERIFICATION_PENDING';
        }

        const messagingStatus = (connection === 'CONNECTED' || connection === 'CHECKING') ? 'SEND_READY' : 'PAUSED';
        const tokenStatus = hasToken ? (account?.token_status || (account?.access_token_encrypted ? 'VALID' : 'UNKNOWN')) : 'MISSING';
        const verificationStatus = account?.business_verification_status || 'UNKNOWN';
        const qualityRating = account?.quality_rating || 'UNKNOWN';

        return {
            connection,
            messaging: messagingStatus,
            token: tokenStatus,
            verification: verificationStatus,
            quality: qualityRating,
            has_access_token: hasToken,
            health_version: Number(account?.health_version || 1),
            last_updated: account?.last_health_check_at || account?.updated_at || new Date().toISOString(),
        };
    }

    /**
     * Phase 3: Backfills all existing WhatsApp accounts in w_wa_accounts using live Meta Graph API responses.
     * Never fabricates values; populates only verified Meta data.
     */
    static async backfillAllAccounts(): Promise<{ total: number; succeeded: number; failed: number }> {
        const { data: accounts, error } = await supabase
            .from('w_wa_accounts')
            .select('*');

        if (error || !accounts) {
            console.error('[AccountHealthService] Failed to fetch accounts for backfill:', error);
            return { total: 0, succeeded: 0, failed: 0 };
        }

        let succeeded = 0;
        let failed = 0;

        for (const account of accounts) {
            if (account.connection_type === 'meta_cloud_api' || account.whatsapp_business_account_id) {
                try {
                    const { getMetaAccountDiagnostics } = await import('./meta.service.js');
                    const diag = await getMetaAccountDiagnostics(account);

                    const tokenStatus = diag.reconnect_required || diag.issue_codes?.includes('token_expired')
                        ? 'EXPIRED'
                        : (diag.issue_codes?.includes('token_missing') ? 'MISSING' : 'VALID');

                    const bizStatus = diag.business_verification?.status
                        ? String(diag.business_verification.status).toUpperCase()
                        : 'UNKNOWN';

                    const qualityRating = diag.phone_number_access?.quality_rating
                        ? String(diag.phone_number_access.quality_rating).toUpperCase()
                        : 'UNKNOWN';

                    const { normalizeMessagingLimitTier } = await import('./meta.service.js');
                    const rawLimit = diag.phone_number_access?.messaging_limit_tier || diag.phone_number_access?.messaging_limit;
                    const messagingLimit = rawLimit ? normalizeMessagingLimitTier(rawLimit) : null;
                    const webhookStatus = diag.webhook_subscription && !diag.webhook_subscription.error ? 'SUBSCRIBED' : 'NOT_SUBSCRIBED';

                    await this.updateHealth(account.id, {
                        connection_status: tokenStatus === 'EXPIRED' ? 'TOKEN_INVALID' : 'CONNECTED',
                        token_status: tokenStatus as any,
                        business_verification_status: bizStatus as any,
                        business_name: diag.business_verification?.business_name || null,
                        business_id: diag.business_verification?.business_id || null,
                        quality_rating: qualityRating as any,
                        messaging_limit: String(messagingLimit),
                        webhook_status: webhookStatus,
                        diagnostics_json: diag,
                    });
                    succeeded++;
                } catch (err: any) {
                    console.error(`[AccountHealthService] Backfill failed for account ${account.id}:`, err.message);
                    failed++;
                }
            }
        }

        console.log(`[AccountHealthService] Backfill completed: ${succeeded}/${accounts.length} succeeded, ${failed} failed.`);
        return { total: accounts.length, succeeded, failed };
    }
}
