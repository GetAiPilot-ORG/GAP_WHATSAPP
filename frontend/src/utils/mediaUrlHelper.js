/**
 * Normalizes media URLs for reliable browser preview and WhatsApp delivery.
 * - Resolves Google Drive view/share links into direct image CDN endpoints.
 * - Resolves Dropbox share links into direct binary downloads (raw=1).
 * - Ensures https:// protocol to prevent mixed-content blocking.
 */
export function normalizeMediaUrl(url, mediaType = 'image') {
    if (!url || typeof url !== 'string') return '';
    let trimmed = url.trim();
    if (!trimmed) return '';

    // Ignore template variables like {{imageUrl}} or {{videoUrl}}
    if (trimmed.includes('{{') && trimmed.includes('}}')) {
        return trimmed;
    }

    // Fix protocol-relative URLs
    if (trimmed.startsWith('//')) {
        trimmed = 'https:' + trimmed;
    } else if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
        trimmed = 'https://' + trimmed;
    }

    // Google Drive conversion:
    // Images: https://lh3.googleusercontent.com/d/{ID}
    // Videos/Files: https://drive.google.com/uc?export=download&id={ID}
    const driveMatch = trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/i);
    if (driveMatch && driveMatch[1]) {
        if (mediaType === 'video' || mediaType === 'audio' || mediaType === 'file' || mediaType === 'document') {
            return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
        }
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }

    // Dropbox conversion:
    // https://www.dropbox.com/s/{ID}/{name}?dl=0 -> raw=1
    if (/dropbox\.com/i.test(trimmed)) {
        if (trimmed.includes('dl=0')) {
            return trimmed.replace('dl=0', 'raw=1');
        }
        if (!trimmed.includes('raw=1')) {
            const separator = trimmed.includes('?') ? '&' : '?';
            return `${trimmed}${separator}raw=1`;
        }
    }

    return trimmed;
}
