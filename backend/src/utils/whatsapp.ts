export type TemplateValidationIssue = {
    code: string;
    severity: 'error' | 'warning';
    field: string;
    message: string;
};

export const TEMPLATE_CATEGORIES = new Set(['MARKETING', 'UTILITY', 'AUTHENTICATION']);
export const TEMPLATE_HEADER_FORMATS = new Set(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']);
export const TEMPLATE_LANG_RE = /^[a-z]{2}(?:_[A-Z]{2})?$/;
export const PROMOTIONAL_WORD_RE = /\b(discount|offer|sale|deal|promo|coupon|cashback|free|limited time|buy now|save|off|exclusive|hurry|register now|enroll now|launch|upgrade)\b/i;
export const OTP_WORD_RE = /\b(otp|one[-\s]?time|verification code|login code|security code|passcode|authentication)\b/i;
export const PLACEHOLDER_COPY_RE = /\b(test(?:ing)?|dummy|ignore(?:\s+it)?|sample\s*(?:message|template)?|lorem ipsum)\b/i;
export const UTILITY_CONTEXT_RE = /\b(order|payment|invoice|receipt|appointment|booking|delivery|shipment|ticket|account|subscription|request|transaction|refund|verification|confirmed|scheduled|cancelled|resolved|updated)\b/i;
export const GENERIC_SAMPLE_RE = /^(?:info|sample(?:\s*\d+)?|test|dummy|value(?:\s*\d+)?)$/i;

export function extractTemplateVariables(text: string) {
    return [...String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(match => Number(match[1]));
}

export function getBodyExampleValues(component: any): string[] {
    const bodyText = component?.example?.body_text;
    if (Array.isArray(bodyText?.[0])) return bodyText[0].map((value: any) => String(value ?? ''));
    if (Array.isArray(bodyText)) return bodyText.map((value: any) => String(value ?? ''));
    return [];
}

export function hasHeaderMediaExample(component: any) {
    const example = component?.example || {};
    return Boolean(
        example.header_handle?.[0]
        || example.header_url?.[0]
    );
}

export function validateVariableSequence(text: string, sampleValues: string[], field: string, issues: TemplateValidationIssue[]) {
    const vars = [...new Set(extractTemplateVariables(text))].sort((a, b) => a - b);
    if (!vars.length) return;

    for (let index = 1; index <= vars[vars.length - 1]; index += 1) {
        if (!vars.includes(index)) {
            issues.push({
                code: 'VARIABLE_SEQUENCE_GAP',
                severity: 'error',
                field,
                message: `Variables must be sequential. Add {{${index}}} or renumber the placeholders.`,
            });
        }
    }

    vars.forEach(variable => {
        const sample = sampleValues[variable - 1];
        if (!String(sample || '').trim()) {
            issues.push({
                code: 'VARIABLE_SAMPLE_REQUIRED',
                severity: 'error',
                field,
                message: `Sample value is required for {{${variable}}}.`,
            });
        }
    });
}

export function validateWhatsappTemplatePayload(payload: any) {
    const issues: TemplateValidationIssue[] = [];
    const normalized = {
        name: String(payload?.name || '').trim().toLowerCase(),
        category: String(payload?.category || '').trim().toUpperCase(),
        language: String(payload?.language || 'en_US').trim(),
        components: Array.isArray(payload?.components) ? payload.components : [],
    };

    if (!/^[a-z0-9_]{1,512}$/.test(normalized.name)) {
        issues.push({ code: 'INVALID_NAME', severity: 'error', field: 'name', message: 'Template name must use lowercase letters, numbers, and underscores only.' });
    }
    if (!TEMPLATE_CATEGORIES.has(normalized.category)) {
        issues.push({ code: 'INVALID_CATEGORY', severity: 'error', field: 'category', message: 'Category must be MARKETING, UTILITY, or AUTHENTICATION.' });
    }
    if (!TEMPLATE_LANG_RE.test(normalized.language)) {
        issues.push({ code: 'INVALID_LANGUAGE', severity: 'error', field: 'language', message: 'Use a WhatsApp language code like en_US or hi.' });
    }

    const components = normalized.components;
    const body = components.find((component: any) => component?.type === 'BODY');
    const headers = components.filter((component: any) => component?.type === 'HEADER');
    const footers = components.filter((component: any) => component?.type === 'FOOTER');
    const buttonsComp = components.find((component: any) => component?.type === 'BUTTONS');
    const allText = components.map((component: any) => [component?.text, ...(component?.buttons || []).map((button: any) => button?.text)].filter(Boolean).join(' ')).join(' ');

    if (!body?.text?.trim()) {
        issues.push({ code: 'BODY_REQUIRED', severity: 'error', field: 'body', message: 'Body text is required.' });
    } else {
        const bodyText = String(body.text);
        if (bodyText.length > 1024) {
            issues.push({ code: 'BODY_TOO_LONG', severity: 'error', field: 'body', message: 'Body text must be 1024 characters or less.' });
        }
        validateVariableSequence(bodyText, getBodyExampleValues(body), 'body', issues);
        if (PLACEHOLDER_COPY_RE.test(bodyText)) {
            issues.push({ code: 'PLACEHOLDER_COPY', severity: 'error', field: 'body', message: 'Testing, dummy, sample, or “ignore” copy cannot be submitted to Meta. Use a real customer message.' });
        }
        if (/^\s*\{\{\d+\}\}/.test(bodyText) || /\{\{\d+\}\}\s*$/.test(bodyText)) {
            issues.push({ code: 'VARIABLE_AT_BOUNDARY', severity: 'error', field: 'body', message: 'Do not place a variable at the very beginning or end of the message.' });
        }
        if (getBodyExampleValues(body).some(value => GENERIC_SAMPLE_RE.test(String(value).trim()))) {
            issues.push({ code: 'GENERIC_VARIABLE_SAMPLE', severity: 'error', field: 'body', message: 'Replace generic samples like “Sample 1” or “info” with realistic values.' });
        }
    }

    if (headers.length > 1) {
        issues.push({ code: 'MULTIPLE_HEADERS', severity: 'error', field: 'header', message: 'Only one header component is allowed.' });
    }
    if (headers[0]) {
        const header = headers[0];
        if (!TEMPLATE_HEADER_FORMATS.has(String(header.format || ''))) {
            issues.push({ code: 'INVALID_HEADER_FORMAT', severity: 'error', field: 'header', message: 'Header must be TEXT, IMAGE, VIDEO, or DOCUMENT.' });
        }
        if (header.format === 'TEXT') {
            if (!String(header.text || '').trim()) issues.push({ code: 'HEADER_TEXT_REQUIRED', severity: 'error', field: 'header', message: 'Text header requires text.' });
            if (String(header.text || '').length > 60) issues.push({ code: 'HEADER_TOO_LONG', severity: 'error', field: 'header', message: 'Text header must be 60 characters or less.' });
            const headerVars = extractTemplateVariables(header.text || '');
            if (headerVars.length > 1) issues.push({ code: 'HEADER_TOO_MANY_VARIABLES', severity: 'error', field: 'header', message: 'Text header supports at most one variable.' });
            validateVariableSequence(String(header.text || ''), header.example?.header_text || [], 'header', issues);
        } else if (!hasHeaderMediaExample(header)) {
            issues.push({ code: 'HEADER_MEDIA_SAMPLE_REQUIRED', severity: 'error', field: 'header', message: `${header.format} header requires an uploaded sample before Meta review.` });
        }
    }

    if (footers.length > 1) {
        issues.push({ code: 'MULTIPLE_FOOTERS', severity: 'error', field: 'footer', message: 'Only one footer component is allowed.' });
    }
    if (footers[0]?.text) {
        if (String(footers[0].text).length > 60) issues.push({ code: 'FOOTER_TOO_LONG', severity: 'error', field: 'footer', message: 'Footer must be 60 characters or less.' });
        if (extractTemplateVariables(footers[0].text).length) issues.push({ code: 'FOOTER_VARIABLES_NOT_ALLOWED', severity: 'error', field: 'footer', message: 'Footer cannot contain variables.' });
    }

    const buttons = Array.isArray(buttonsComp?.buttons) ? buttonsComp.buttons : [];
    if (buttons.length > 10) issues.push({ code: 'TOO_MANY_BUTTONS', severity: 'error', field: 'buttons', message: 'Templates support up to 10 buttons.' });
    const urlButtons = buttons.filter((button: any) => button?.type === 'URL');
    const phoneButtons = buttons.filter((button: any) => button?.type === 'PHONE_NUMBER');
    const quickButtons = buttons.filter((button: any) => button?.type === 'QUICK_REPLY');
    if (urlButtons.length > 2) issues.push({ code: 'TOO_MANY_URL_BUTTONS', severity: 'error', field: 'buttons', message: 'Use at most two URL buttons.' });
    if (phoneButtons.length > 1) issues.push({ code: 'TOO_MANY_PHONE_BUTTONS', severity: 'error', field: 'buttons', message: 'Use at most one phone button.' });
    if (quickButtons.length > 10) issues.push({ code: 'TOO_MANY_QUICK_REPLY_BUTTONS', severity: 'error', field: 'buttons', message: 'Use at most ten quick reply buttons.' });

    buttons.forEach((button: any, index: number) => {
        const label = String(button?.text || '').trim();
        if (!label && !['COPY_CODE', 'OTP'].includes(String(button?.type || ''))) issues.push({ code: 'BUTTON_TEXT_REQUIRED', severity: 'error', field: `buttons.${index}`, message: 'Button text is required.' });
        if (label.length > 25) issues.push({ code: 'BUTTON_TEXT_TOO_LONG', severity: 'error', field: `buttons.${index}`, message: 'Button text must be 25 characters or less.' });
        if (button?.type === 'URL') {
            const url = String(button.url || '').trim();
            if (!/^https?:\/\/.+/i.test(url)) issues.push({ code: 'INVALID_BUTTON_URL', severity: 'error', field: `buttons.${index}.url`, message: 'URL button must start with http:// or https://.' });
            const vars = extractTemplateVariables(url);
            if (vars.length > 1 || (vars.length === 1 && !/\{\{\s*\d+\s*\}\}\s*$/.test(url))) {
                issues.push({ code: 'INVALID_DYNAMIC_URL', severity: 'error', field: `buttons.${index}.url`, message: 'Dynamic URL can contain one variable, and it must be at the end of the URL.' });
            }
        }
        if (button?.type === 'PHONE_NUMBER' && !/^\+[1-9]\d{7,14}$/.test(String(button.phone_number || ''))) {
            issues.push({ code: 'INVALID_PHONE_BUTTON', severity: 'error', field: `buttons.${index}.phone_number`, message: 'Phone button must use E.164 format, for example +919999999999.' });
        }
        if (button?.type === 'FLOW' && (!String(button.flow_id || '').trim() || !String(button.navigate_screen || '').trim())) {
            issues.push({ code: 'INVALID_FLOW_BUTTON', severity: 'error', field: `buttons.${index}`, message: 'Flow button requires a published flow and destination screen.' });
        }
        if (button?.type === 'COPY_CODE' && !String(button.example || '').trim()) {
            issues.push({ code: 'COPY_CODE_EXAMPLE_REQUIRED', severity: 'error', field: `buttons.${index}`, message: 'Copy code button requires an example code.' });
        }
        if (!['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'OTP', 'CATALOG', 'FLOW'].includes(String(button?.type || ''))) {
            issues.push({ code: 'INVALID_BUTTON_TYPE', severity: 'error', field: `buttons.${index}.type`, message: 'Unsupported button type.' });
        }
    });

    if (normalized.category === 'UTILITY' && PROMOTIONAL_WORD_RE.test(allText)) {
        issues.push({ code: 'UTILITY_PROMOTIONAL_CONTENT', severity: 'error', field: 'category', message: 'Utility templates cannot include promotional language. Use Marketing for offers, discounts, sales, or acquisition CTAs.' });
    }
    if (normalized.category === 'UTILITY' && body?.text && !UTILITY_CONTEXT_RE.test(String(body.text))) {
        issues.push({ code: 'UTILITY_CONTEXT_REQUIRED', severity: 'error', field: 'category', message: 'Utility templates must describe a specific transaction or customer-requested update. Use Marketing for general outreach.' });
    }
    if (normalized.category !== 'AUTHENTICATION' && OTP_WORD_RE.test(allText)) {
        issues.push({ code: 'OTP_REQUIRES_AUTHENTICATION', severity: 'error', field: 'category', message: 'OTP or verification-code content must use the Authentication category.' });
    }
    if (normalized.category === 'AUTHENTICATION') {
        if (headers.length || footers.length) issues.push({ code: 'AUTH_NO_HEADER_FOOTER', severity: 'error', field: 'components', message: 'Authentication templates should not include custom headers or footers.' });
        if (PROMOTIONAL_WORD_RE.test(allText)) issues.push({ code: 'AUTH_PROMOTIONAL_CONTENT', severity: 'error', field: 'body', message: 'Authentication templates cannot contain promotional language.' });
        const authVars = body?.text ? getBodyExampleValues(body) : [];
        if (!extractTemplateVariables(body?.text || '').length) issues.push({ code: 'AUTH_VARIABLE_REQUIRED', severity: 'error', field: 'body', message: 'Authentication templates require an OTP variable such as {{1}}.' });
        if (authVars.some(value => String(value || '').length > 15)) issues.push({ code: 'AUTH_SAMPLE_TOO_LONG', severity: 'error', field: 'body', message: 'Authentication sample values must be 15 characters or less.' });
        if (!OTP_WORD_RE.test(allText)) issues.push({ code: 'AUTH_OTP_WORDING_REQUIRED', severity: 'warning', field: 'body', message: 'Authentication templates should clearly describe a verification code.' });
    }

    const errorCount = issues.filter(issue => issue.severity === 'error').length;
    const warningCount = issues.filter(issue => issue.severity === 'warning').length;
    const riskScore = Math.min(100, errorCount * 35 + warningCount * 12);
    const approvalState = errorCount > 0 ? 'blocked' : warningCount > 0 ? 'needs_review' : 'ready';

    return { normalized, issues, riskScore, approvalState, canSubmit: errorCount === 0 };
}

export function enrichTemplateExamplesWithRealisticSamples(components: any[]) {
    if (!Array.isArray(components)) return components;

    for (const comp of components) {
        if (comp.type === 'BODY' && typeof comp.text === 'string') {
            const matches = comp.text.match(/\{\{(\d+)\}\}/g);
            if (matches) {
                const varIndices: number[] = Array.from(
                    new Set<number>(matches.map((m: string) => parseInt(m.replace(/[^0-9]/g, ''), 10)))
                ).sort((a: number, b: number) => a - b);
                const maxVar = varIndices.length > 0 ? Math.max(...varIndices) : 0;
                if (maxVar > 0) {
                    const segments = comp.text.split(/\{\{\s*\d+\s*\}\}/);
                    const samples = Array.from({ length: maxVar }, (_, i) => {
                        const contextBefore = (segments[i] || '').toLowerCase();
                        const contextAfter = (segments[i + 1] || '').toLowerCase();
                        
                        if (/\b(hi|hello|dear|hey|hola|welcome|greeting)\b/.test(contextBefore)) {
                            return "John";
                        }
                        if (/\b(address|street|location|city|delivery address|destination)\b/.test(contextBefore) || /\b(address|location|destination)\b/.test(contextAfter)) {
                            return "123 Main St, New York";
                        }
                        if (/\b(refund of|amount|price|total|payment of|fee|bill|due|charge|payment|usd|inr|rs|paying|refund)\b/.test(contextBefore) || /[\$\£\¥\₹]\s*$/.test(contextBefore)) {
                            return "50.00";
                        }
                        if (/\b(order|invoice|ticket|booking|id|reference|ref|txn|transaction|#)\b/.test(contextBefore) || /#\s*$/.test(contextBefore)) {
                            return "10834";
                        }
                        if (/\b(account on|website|portal|app|platform|url|link|system)\b/.test(contextBefore)) {
                            return "our website";
                        }
                        if (/\b(due to|reason|because of|suspended for|error|violation)\b/.test(contextBefore)) {
                            return "suspicious activity";
                        }
                        if (/\b(contact|support|call|reach|email)\b/.test(contextBefore) || /\b(support|inquiries|help)\b/.test(contextAfter)) {
                            return "support@example.com";
                        }
                        if (/\b(otp|code|verification|login|security|password|passcode)\b/.test(contextBefore) || /\b(otp|code|verification)\b/.test(contextAfter)) {
                            return "123456";
                        }
                        if (/\b(scheduled for|appointment on|delivery on|date of|appointment at|scheduled at|on|at|date|time|scheduled|appointment|delivery)\b/.test(contextBefore) || /\b(am|pm|ist|utc|est|gmt)\b/.test(contextAfter)) {
                            return "June 25th";
                        }
                        if (/\b(within|in|takes|about|around)\b/.test(contextBefore) || /\b(days|business days|working days|hours|minutes|mins|weeks|months)\b/.test(contextAfter)) {
                            return "3";
                        }
                        return "info";
                    });
                    if (!getBodyExampleValues(comp).some(value => String(value).trim())) {
                        comp.example = { body_text: [samples] };
                    }
                }
            }
        } else if (comp.type === 'HEADER' && comp.format === 'TEXT' && typeof comp.text === 'string') {
            const matches = comp.text.match(/\{\{(\d+)\}\}/g);
            if (matches) {
                const varIndices: number[] = Array.from(
                    new Set<number>(matches.map((m: string) => parseInt(m.replace(/[^0-9]/g, ''), 10)))
                ).sort((a: number, b: number) => a - b);
                const maxVar = varIndices.length > 0 ? Math.max(...varIndices) : 0;
                if (maxVar > 0) {
                    const segments = comp.text.split(/\{\{\s*\d+\s*\}\}/);
                    const samples = Array.from({ length: maxVar }, (_, i) => {
                        const contextBefore = (segments[i] || '').toLowerCase();
                        if (/\b(hi|hello|dear|hey|hola|welcome)\b/.test(contextBefore)) {
                            return "John";
                        }
                        if (/\b(order|invoice|id|#)\b/.test(contextBefore) || /#\s*$/.test(contextBefore)) {
                            return "10834";
                        }
                        return "heading";
                    });
                    if (!Array.isArray(comp.example?.header_text) || !comp.example.header_text.some((value: any) => String(value).trim())) {
                        comp.example = { header_text: samples };
                    }
                }
            }
        }
    }
    return components;
}
