import cron from "node-cron";
import { supabase } from './config/supabase.js';
import { processCampaign } from './services/broadcast.service.js';

export function startCronJobs() {
    if (process.env.BROADCAST_QUEUE_ENABLED === 'true') {
        console.log('[broadcast] Legacy campaign cron disabled; BullMQ owns scheduling and recovery');
        return;
    }
    // Process scheduled campaigns every minute
    cron.schedule('* * * * *', async () => {
        try {
            const { data: campaigns, error } = await supabase
                .from('w_campaigns')
                .select('*')
                .eq('status', 'scheduled')
                .lte('scheduled_at', new Date().toISOString());

            if (error || !campaigns) return;

            for (const camp of campaigns) {
                processCampaign(camp).catch(err => console.error('Cron processCampaign error:', err));
            }
        } catch (e) {
            console.error('Campaign cron error:', e);
        }
    });

    // Also pick up any stuck "processing" campaigns periodically (every 5 mins)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const { data: stuckCampaigns, error } = await supabase
                .from('w_campaigns')
                .select('*')
                .eq('status', 'processing')
                // Wait at least 5 minutes before considering it stuck
                .lte('created_at', new Date(Date.now() - 5 * 60000).toISOString());

            if (error || !stuckCampaigns) return;

            for (const camp of stuckCampaigns) {
                processCampaign(camp).catch(err => console.error('Stuck campaign recovery error:', err));
            }
        } catch (e) {
            console.error('Stuck campaign cron error:', e);
        }
    });

    // Trigger initial AccountHealthService backfill immediately on startup
    import('./services/accountHealth.service.js').then(({ AccountHealthService }) => {
        console.log('[AccountHealth] Triggering immediate startup health backfill...');
        AccountHealthService.backfillAllAccounts().catch(err => console.error('[AccountHealth] Startup backfill error:', err));
    });

    // Periodic WhatsApp Account Health Sync (runs every 6 hours)
    cron.schedule('0 */6 * * *', async () => {
        try {
            console.log('[AccountHealth] Running 6-hour periodic account health sync...');
            const { data: accounts } = await supabase
                .from('w_wa_accounts')
                .select('*')
                .eq('status', 'connected');

            if (!accounts || accounts.length === 0) return;

            for (const account of accounts) {
                if (account.connection_type === 'meta_cloud_api' || account.whatsapp_business_account_id) {
                    const { getMetaAccountDiagnostics } = await import('./services/meta.service.js');
                    const { AccountHealthService } = await import('./services/accountHealth.service.js');

                    const diag = await getMetaAccountDiagnostics(account).catch(() => null);
                    if (diag) {
                        const tokenStatus = diag.reconnect_required || diag.issue_codes?.includes('token_expired')
                            ? 'EXPIRED'
                            : (diag.issue_codes?.includes('token_missing') ? 'MISSING' : 'VALID');

                        const bizStatus = diag.business_verification?.status === 'verified'
                            ? 'VERIFIED'
                            : (diag.business_verification?.status ? 'ACTION_REQUIRED' : 'UNKNOWN');

                        await AccountHealthService.updateHealth(account.id, {
                            connection_status: tokenStatus === 'EXPIRED' ? 'TOKEN_INVALID' : 'CONNECTED',
                            token_status: tokenStatus,
                            business_verification_status: bizStatus,
                            business_name: diag.business_verification?.business_name || null,
                            business_id: diag.business_verification?.business_id || null,
                            diagnostics_json: diag,
                        }).catch(err => console.error('[AccountHealth] Cron update error:', err.message));
                    }
                }
            }
            console.log(`[AccountHealth] ✅ Periodic health sync completed for ${accounts.length} accounts.`);
        } catch (e) {
            console.error('[AccountHealth] Periodic health sync cron error:', e);
        }
    });

    console.log('✅ Cron jobs started');
}
