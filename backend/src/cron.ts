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

            const cronStart = Date.now();
            let syncedCount = 0;
            let skippedCount = 0;

            for (const account of accounts) {
                if (account.connection_type === 'meta_cloud_api' || account.whatsapp_business_account_id) {
                    // Multi-instance Lock Check: Skip if synced by another server instance in the last 5 minutes
                    const lastCheckMs = account.last_health_check_at ? new Date(account.last_health_check_at).getTime() : 0;
                    if (Date.now() - lastCheckMs < 5 * 60 * 1000) {
                        skippedCount++;
                        console.log(`[AccountHealth] Multi-instance lock: Skipping redundant sync for account ${account.id} (synced ${Math.floor((Date.now() - lastCheckMs)/1000)}s ago)`);
                        continue;
                    }

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
                        syncedCount++;
                    }
                }
            }
            const durationMs = Date.now() - cronStart;
            console.log(`[AccountHealth] ✅ Periodic health sync completed: ${syncedCount} synced, ${skippedCount} skipped in ${durationMs}ms.`);
        } catch (e) {
            console.error('[AccountHealth] Periodic health sync cron error:', e);
        }
    });

    // Follow-up flow sessions every 15 mins
    cron.schedule('*/15 * * * *', async () => {
        try {
            const { data: sessions, error } = await supabase
                .from('w_flow_sessions')
                .select('*')
                .eq('status', 'waiting');

            if (error || !sessions) return;

            for (const session of sessions) {
                try {
                    const stateData = session.state_data || {};
                    if (stateData.follow_up_sent) continue;

                    // Fetch the flow configuration to find current node's follow-up settings
                    const { data: flow } = await supabase.from('w_flows').select('nodes').eq('id', session.flow_id).maybeSingle();
                    if (!flow?.nodes) continue;

                    const currentNode = flow.nodes.find((n: any) => n.id === session.current_node_id);
                    const followUpConfig = currentNode?.data?.config?.followUp;
                    
                    if (!followUpConfig?.enabled) continue;

                    const waitHours = followUpConfig.hours || 2;
                    const followUpMessage = followUpConfig.message || "Hi, we noticed you haven't replied. Please let us know if you need any help to continue!";

                    // Check if elapsed time is greater than configured wait time
                    const updatedAt = new Date(session.updated_at || session.created_at).getTime();
                    const elapsedHours = (Date.now() - updatedAt) / (1000 * 60 * 60);

                    if (elapsedHours < waitHours) continue; // Not enough time has passed

                    // Fetch contact phone
                    const { data: contact } = await supabase.from('w_contacts').select('phone').eq('id', session.contact_id).maybeSingle();
                    if (!contact?.phone) continue;

                    // Fetch wa_account_id to get phone_number_id
                    let phoneNumberId = null;
                    if (session.conversation_id) {
                        const { data: conv } = await supabase.from('w_conversations').select('wa_account_id').eq('id', session.conversation_id).maybeSingle();
                        if (conv?.wa_account_id) {
                            const { data: acc } = await supabase.from('w_wa_accounts').select('phone_number_id').eq('id', conv.wa_account_id).maybeSingle();
                            phoneNumberId = acc?.phone_number_id || null;
                        }
                    }

                    const { sendTextMessage } = await import('./services/messages.sender.js');
                    await sendTextMessage(contact.phone, followUpMessage, phoneNumberId);

                    // Update session to mark follow-up sent
                    stateData.follow_up_sent = true;
                    await supabase.from('w_flow_sessions').update({ state_data: stateData }).eq('id', session.id);
                    
                    console.log(`[FlowFollowUp] Sent follow-up to ${contact.phone} (Node: ${session.current_node_id})`);
                } catch (e) {
                    console.error('[FlowFollowUp] Error sending to session', session.id, e);
                }
            }
        } catch (e) {
            console.error('[FlowFollowUp] Cron error:', e);
        }
    });

    console.log('✅ Cron jobs started');
}
