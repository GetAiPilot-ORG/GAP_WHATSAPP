export function getPendingReviewInfo(template, now = Date.now()) {
    const submittedAt = new Date(template.submitted_at || template.last_updated || 0);
    const hours = Number.isNaN(submittedAt.getTime()) ? 0 : Math.max(0, Math.floor((now - submittedAt.getTime()) / 3600000));
    const text = (template.components || []).map(component => component.text || '').join(' ');
    const hasMedia = (template.components || []).some(component => component.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(component.format));
    const hints = [];

    if (/\b(test|testing|ignore|sample|dummy)\b/i.test(text)) hints.push('Placeholder/testing copy can look low-quality or unclear to reviewers.');
    if (/\b(loan|credit|interest|finance|fund|emi|discount|offer)\b/i.test(text)) hints.push('Financial or promotional claims can require additional policy review.');
    if (hasMedia) hints.push('Meta also reviews the uploaded media asset, so media templates may take longer.');

    return {
        hours,
        overdue: hours >= 24,
        hint: hints[0] || 'No format issue is visible. This is currently in Meta’s review queue.',
    };
}
