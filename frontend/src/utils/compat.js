/**
 * Safari & Cross-Browser Compatibility Utilities
 */

/**
 * Generates a standard UUID v4 safely across all browsers,
 * including older Safari / iOS versions where crypto.randomUUID() is not defined.
 */
export function safeRandomUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch {
            // Fall through to fallback
        }
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        try {
            const buf = new Uint8Array(16);
            crypto.getRandomValues(buf);
            buf[6] = (buf[6] & 0x0f) | 0x40; // Version 4
            buf[8] = (buf[8] & 0x3f) | 0x80; // Variant 10
            const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
        } catch {
            // Fall through to timestamp fallback
        }
    }

    // High entropy timestamp + random fallback
    const d = Date.now();
    const d2 = (typeof performance !== 'undefined' && performance.now && performance.now() * 1000) || 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16;
        if (d > 0) {
            r = (d + r) % 16 | 0;
        } else if (d2 > 0) {
            r = (d2 + r) % 16 | 0;
        }
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

/**
 * Safely copies text to the clipboard with legacy fallback for iOS Safari / non-HTTPS contexts.
 */
export async function safeClipboardCopy(text) {
    if (!text && text !== '') return false;

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(String(text));
            return true;
        } catch (err) {
            console.warn('[safeClipboardCopy] navigator.clipboard failed, attempting fallback:', err);
        }
    }

    // Fallback using textarea + execCommand
    try {
        if (typeof document === 'undefined') return false;
        const textArea = document.createElement('textarea');
        textArea.value = String(text);
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, textArea.value.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.warn('[safeClipboardCopy] execCommand copy fallback failed:', err);
        return false;
    }
}

/**
 * Safely invokes navigator.share, catching AbortError when the user cancels iOS share sheet.
 */
export async function safeShare(shareData) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            await navigator.share(shareData);
            return true;
        } catch (err) {
            // User aborted or dismissed the share sheet - not an application crash
            if (err?.name === 'AbortError') {
                return false;
            }
            console.warn('[safeShare] navigator.share error:', err);
            return false;
        }
    }
    return false;
}
