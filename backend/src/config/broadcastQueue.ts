import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

export const BROADCAST_PREPARE_QUEUE = 'broadcast-prepare';
export const BROADCAST_SEND_QUEUE = 'broadcast-send';
export const BROADCAST_RECONCILE_QUEUE = 'broadcast-reconcile';

let connection: Redis | null = null;

export function isBroadcastQueueEnabled() {
    return process.env.BROADCAST_QUEUE_ENABLED === 'true' && Boolean(process.env.REDIS_URL);
}

export function getBroadcastRedis() {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for broadcast workers');
    if (!connection) {
        connection = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
            lazyConnect: true,
            tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        });
        connection.on('error', (error: Error) => {
            console.error('[broadcast-queue] Redis connection error', { message: error.message });
        });
    }
    return connection;
}

function queue(name: string) {
    return new Queue(name, {
        connection: getBroadcastRedis(),
        defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 86_400, count: 10_000 },
            removeOnFail: { age: 604_800, count: 25_000 },
        },
    });
}

let prepareQueue: Queue | null = null;
let sendQueue: Queue | null = null;
let reconcileQueue: Queue | null = null;

export const getBroadcastPrepareQueue = () => (prepareQueue ||= queue(BROADCAST_PREPARE_QUEUE));
export const getBroadcastSendQueue = () => (sendQueue ||= queue(BROADCAST_SEND_QUEUE));
export const getBroadcastReconcileQueue = () => (reconcileQueue ||= queue(BROADCAST_RECONCILE_QUEUE));

export async function enqueueCampaignPreparation(campaignId: string, scheduledAt?: string | null) {
    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;
    return getBroadcastPrepareQueue().add(
        'prepare',
        { campaignId },
        { jobId: `prepare-${campaignId}`, delay },
    );
}

export async function closeBroadcastQueues() {
    await Promise.all([
        prepareQueue?.close(),
        sendQueue?.close(),
        reconcileQueue?.close(),
    ]);
    prepareQueue = null;
    sendQueue = null;
    reconcileQueue = null;
    if (connection) await connection.quit();
    connection = null;
}
