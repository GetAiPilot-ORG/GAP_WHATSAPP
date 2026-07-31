import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { supabase } from '../supabaseClient';

const PushContext = createContext(null);

export const usePush = () => useContext(PushContext);

// Utility to convert Base64 URL to Uint8Array for VAPID key
const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export const PushProvider = ({ children }) => {
    const [permissionStatus, setPermissionStatus] = useState(Notification.permission);
    const [isSubscribed, setIsSubscribed] = useState(false);

    // Ensure we only run this once we have an active session
    useEffect(() => {
        const checkSubscription = async () => {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        };

        checkSubscription();
    }, []);

    const subscribeToPush = async (orgId) => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.error('Push notifications are not supported by this browser.');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            setPermissionStatus(permission);

            if (permission !== 'granted') {
                console.error('Push notification permission denied.');
                return false;
            }

            const registration = await navigator.serviceWorker.ready;
            
            // Get public key from env
            const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });

            // Send subscription to backend
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No active user session');

            await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/push/subscribe`, {
                subscription,
                orgId
            }, {
                headers: {
                    Authorization: `Bearer ${session.access_token}`
                }
            });

            setIsSubscribed(true);
            return true;
        } catch (error) {
            console.error('Failed to subscribe to push notifications:', error);
            return false;
        }
    };

    const unsubscribeFromPush = async () => {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                // Remove from backend
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    await axios.delete(`${import.meta.env.VITE_BACKEND_URL}/api/push/unsubscribe`, {
                        data: { endpoint: subscription.endpoint },
                        headers: { Authorization: `Bearer ${session.access_token}` }
                    });
                }

                // Remove from browser
                await subscription.unsubscribe();
                setIsSubscribed(false);
            }
        } catch (error) {
            console.error('Failed to unsubscribe:', error);
        }
    };

    return (
        <PushContext.Provider value={{ permissionStatus, isSubscribed, subscribeToPush, unsubscribeFromPush }}>
            {children}
        </PushContext.Provider>
    );
};
