import { toast as sonnerToast } from 'sonner';

/**
 * Global Notification Service using Sonner
 * Provides a unified API for success, error, info, warning, loading, and promise notifications.
 * Implements deduplication to prevent toast spamming.
 */

const recentToasts = new Map();
const DEBOUNCE_MS = 1500;

function isDuplicate(message) {
    const now = Date.now();
    const lastTime = recentToasts.get(message);
    if (lastTime && now - lastTime < DEBOUNCE_MS) {
        return true;
    }
    recentToasts.set(message, now);
    // Cleanup old entries
    if (recentToasts.size > 50) {
        for (const [key, timestamp] of recentToasts.entries()) {
            if (now - timestamp > DEBOUNCE_MS * 2) {
                recentToasts.delete(key);
            }
        }
    }
    return false;
}

export const notify = {
    /**
     * Show success toast (Green accent, ~2.5s duration)
     */
    success(message, options) {
        if (isDuplicate(`success:${message}`)) return;
        return sonnerToast.success(message, {
            duration: options?.duration || 2500,
            description: options?.description,
            action: options?.action,
            id: options?.id,
        });
    },

    /**
     * Show error toast (Red accent, ~4s duration)
     */
    error(message, options) {
        if (isDuplicate(`error:${message}`)) return;
        return sonnerToast.error(message, {
            duration: options?.duration || 4000,
            description: options?.description,
            action: options?.action,
            id: options?.id,
        });
    },

    /**
     * Show warning toast (Amber accent, ~3.5s duration)
     */
    warning(message, options) {
        if (isDuplicate(`warning:${message}`)) return;
        return sonnerToast.warning(message, {
            duration: options?.duration || 3500,
            description: options?.description,
            action: options?.action,
            id: options?.id,
        });
    },

    /**
     * Show info toast (Blue accent, ~3s duration)
     */
    info(message, options) {
        if (isDuplicate(`info:${message}`)) return;
        return sonnerToast.info(message, {
            duration: options?.duration || 3000,
            description: options?.description,
            action: options?.action,
            id: options?.id,
        });
    },

    /**
     * Show loading toast (neutral, stays until dismissed or updated)
     */
    loading(message, options) {
        return sonnerToast.loading(message, {
            duration: Infinity,
            description: options?.description,
            id: options?.id,
        });
    },

    /**
     * Handle promise state automatically (Loading -> Success/Error)
     */
    promise(promise, messages, options) {
        return sonnerToast.promise(promise, {
            loading: messages.loading,
            success: messages.success,
            error: messages.error,
            description: options?.description,
            duration: options?.duration,
        });
    },

    /**
     * Dismiss a specific toast by ID or all toasts
     */
    dismiss(toastId) {
        return sonnerToast.dismiss(toastId);
    },

    /**
     * Toast with custom Undo action
     */
    undo(message, onUndo, options) {
        return sonnerToast(message, {
            duration: options?.duration || 4500,
            description: options?.description,
            action: {
                label: 'Undo',
                onClick: onUndo,
            },
        });
    }
};

/**
 * Form Helper: Focus and scroll smoothly to the first invalid field
 */
export function scrollToFirstError(formElement) {
    if (typeof document === 'undefined') return;
    const container = formElement || document;
    // Find input/select/textarea marked invalid or having aria-invalid
    const invalidInput = container.querySelector(
        'input:invalid, select:invalid, textarea:invalid, [aria-invalid="true"], .is-invalid, .border-red-500'
    );
    if (invalidInput) {
        invalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalidInput.focus({ preventScroll: true });
    }
}

export default notify;
