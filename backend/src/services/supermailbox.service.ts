export async function sendTransactionalEmail(options: {
    to: string;
    productCode: string;
    templateKey: string;
    variables: Record<string, any>;
    idempotencyKey?: string;
}) {
    if (process.env.MAIL_ON !== 'true') return;
    const apiKey = process.env.SUPERMAILBOX_API_KEY;
    
    if (!apiKey) {
        console.warn('[Supermailbox] Skipping transactional email because SUPERMAILBOX_API_KEY is missing.');
        return;
    }

    try {
        const apiUrl = process.env.SUPERMAILBOX_API_URL || 'http://localhost:5050';
        const response = await fetch(`${apiUrl}/v1/send/transactional`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                to: options.to,
                productCode: options.productCode,
                templateKey: options.templateKey,
                variables: options.variables,
                idempotencyKey: options.idempotencyKey
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[Supermailbox] Failed to send email (Template: ${options.templateKey} to ${options.to}): status=${response.status} err=${errBody}`);
        } else {
            console.log(`[Supermailbox] Transactional email sent successfully to ${options.to} (Template: ${options.templateKey})`);
        }
    } catch (err: any) {
        console.error(`[Supermailbox] Exception sending email (Template: ${options.templateKey} to ${options.to}):`, err.message);
    }
}
