import webpush from 'web-push';
import { supabase } from '../config/supabase.js';

// Initialize web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:support@gapwhatsapp.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('⚠️ VAPID keys are not set. Push notifications will not work.');
}

/**
 * Save a push subscription to the database
 */
export const saveSubscription = async (userId: string, orgId: string, subscription: any) => {
    try {
        const { endpoint, keys } = subscription;
        
        // Upsert based on user_id and endpoint
        const { data, error } = await supabase
            .from('push_subscriptions')
            .upsert(
                {
                    user_id: userId,
                    org_id: orgId,
                    endpoint: endpoint,
                    p256dh: keys.p256dh,
                    auth: keys.auth,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'user_id, endpoint' }
            );

        if (error) {
            console.error('Error saving push subscription:', error);
            throw error;
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to save push subscription:', error);
        throw error;
    }
};

/**
 * Remove a push subscription from the database
 */
export const removeSubscription = async (userId: string, endpoint: string) => {
    try {
        const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .match({ user_id: userId, endpoint });

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Failed to remove push subscription:', error);
        throw error;
    }
};

/**
 * Send a push notification to specific users
 */
export const sendPushNotificationToUsers = async (userIds: string[], payload: any) => {
    if (!process.env.VAPID_PUBLIC_KEY) return; // Silent fail if not configured

    try {
        // Fetch all subscriptions for these users
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('*')
            .in('user_id', userIds);

        if (error) throw error;
        if (!subscriptions || subscriptions.length === 0) return;

        const stringPayload = JSON.stringify(payload);

        // Send to all devices
        const pushPromises = subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };

            try {
                await webpush.sendNotification(pushSubscription, stringPayload);
            } catch (err: any) {
                // If the subscription is no longer valid (e.g. user revoked permission), delete it
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await removeSubscription(sub.user_id, sub.endpoint);
                } else {
                    console.error('Error sending push notification to endpoint:', err);
                }
            }
        });

        await Promise.allSettled(pushPromises);
    } catch (error) {
        console.error('Error in sendPushNotificationToUsers:', error);
    }
};

/**
 * Send a push notification to all users in an organization
 */
export const sendPushNotificationToOrg = async (orgId: string, payload: any) => {
    if (!process.env.VAPID_PUBLIC_KEY) return;

    try {
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('org_id', orgId);

        if (error) throw error;
        if (!subscriptions || subscriptions.length === 0) return;

        const stringPayload = JSON.stringify(payload);

        const pushPromises = subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };

            try {
                await webpush.sendNotification(pushSubscription, stringPayload);
            } catch (err: any) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await removeSubscription(sub.user_id, sub.endpoint);
                } else {
                    console.error('Error sending push notification to endpoint:', err);
                }
            }
        });

        await Promise.allSettled(pushPromises);
    } catch (error) {
        console.error('Error in sendPushNotificationToOrg:', error);
    }
};
