import { DelayedError, Worker } from 'bullmq';
import {
    BROADCAST_PREPARE_QUEUE,
    BROADCAST_RECONCILE_QUEUE,
    BROADCAST_SEND_QUEUE,
    closeBroadcastQueues,
    getBroadcastReconcileQueue,
    getBroadcastRedis,
} from '../config/broadcastQueue.js';
import {
    dispatchCampaignWindow,
    cancelCampaignRecipients,
    BroadcastPausedError,
    finalizeCampaignIfComplete,
    prepareCampaignForQueue,
    sendQueuedRecipient,
} from '../services/broadcastQueue.service.js';
import { supabase } from '../config/supabase.js';

const connection = getBroadcastRedis();
const workers: Worker[] = [];

workers.push(new Worker(BROADCAST_PREPARE_QUEUE, async (job: any) => {
    try {
        await prepareCampaignForQueue(job.data.campaignId);
    } catch (error: any) {
        await supabase.from('w_campaigns').update({
            status: 'cancelling',
            queue_error: error.message || 'Campaign preparation failed',
            last_progress_at: new Date().toISOString(),
        }).eq('id', job.data.campaignId);
        await cancelCampaignRecipients(job.data.campaignId);
        await supabase.from('w_campaigns').update({
            status: 'failed',
            queue_error: error.message || 'Campaign preparation failed',
        }).eq('id', job.data.campaignId);
        throw error;
    }
}, { connection, concurrency: Number(process.env.BROADCAST_PREPARE_CONCURRENCY || 2) }));

workers.push(new Worker(BROADCAST_SEND_QUEUE, async (job: any) => {
    try {
        await sendQueuedRecipient(job.data.recipientId);
    } catch (error) {
        if (error instanceof BroadcastPausedError) {
            await job.moveToDelayed(Date.now() + error.retryAfterMs, job.token);
            throw new DelayedError();
        }
        throw error;
    }
    await dispatchCampaignWindow(job.data.campaignId);
    await finalizeCampaignIfComplete(job.data.campaignId);
}, { connection, concurrency: Number(process.env.BROADCAST_SEND_CONCURRENCY || 20) }));

workers.push(new Worker(BROADCAST_RECONCILE_QUEUE, async () => {
    const staleBefore = new Date(Date.now() - Number(process.env.BROADCAST_STALE_MINUTES || 15) * 60_000).toISOString();
    const { data: stale } = await supabase.from('w_campaign_recipients')
        .select('id, campaign_id')
        .eq('status', 'processing')
        .lt('processing_started_at', staleBefore)
        .limit(500);
    for (const row of stale || []) {
        await supabase.from('w_campaign_recipients').update({
            status: 'retrying', retry_after: new Date().toISOString(), error_class: 'stale_worker',
        }).eq('id', row.id).eq('status', 'processing');
        await dispatchCampaignWindow(row.campaign_id);
    }
}, { connection, concurrency: 1 }));

await getBroadcastReconcileQueue().upsertJobScheduler(
    'broadcast-reconcile-scheduler',
    { every: 60_000 },
    { name: 'reconcile', data: {} },
);

for (const worker of workers) {
    worker.on('failed', (job: any, error: any) => {
        console.error('[broadcast-worker] Job failed', {
            queue: worker.name, jobId: job?.id, message: error.message,
        });
    });
}

async function shutdown(signal: string) {
    console.log('[broadcast-worker] Graceful shutdown', { signal });
    await Promise.all(workers.map((worker) => worker.close()));
    await closeBroadcastQueues();
    process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log('[broadcast-worker] Ready', {
    sendConcurrency: Number(process.env.BROADCAST_SEND_CONCURRENCY || 20),
});
