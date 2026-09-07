import 'dotenv/config';

process.env.SUPERMAILBOX_API_KEY = 'supermailbox-secret-key-12345';
process.env.SUPERMAILBOX_API_URL = 'http://localhost:5050';

import { sendTransactionalEmail } from './src/services/supermailbox.service.js';

async function testEmails() {
    console.log('Sending broadcast_success...');
    await sendTransactionalEmail({
        to: 'test-success@example.com',
        productCode: 'GAP_WHATSAPP',
        templateKey: 'broadcast_success',
        idempotencyKey: `gap_whatsapp_broadcast_success_test_${Date.now()}`,
        variables: {
            full_name: 'Test Admin',
            campaign_name: 'Test Campaign',
        }
    });

    console.log('Sending broadcast_failed...');
    await sendTransactionalEmail({
        to: 'test-failed@example.com',
        productCode: 'GAP_WHATSAPP',
        templateKey: 'broadcast_failed',
        idempotencyKey: `gap_whatsapp_broadcast_failed_test_${Date.now()}`,
        variables: {
            full_name: 'Test Admin',
            campaign_name: 'Test Campaign',
            error_message: 'This is a test error message',
        }
    });

    console.log('Sending team_invite...');
    await sendTransactionalEmail({
        to: 'test-invite@example.com',
        productCode: 'GAP_WHATSAPP',
        templateKey: 'team_invite',
        idempotencyKey: `gap_whatsapp_team_invite_test_${Date.now()}`,
        variables: {
            full_name: 'Test User',
            role: 'Agent',
            password: 'Flow-test-password',
            invite_link: 'http://localhost:3000/invite',
            expires_at: new Date().toISOString(),
            frontend_url: 'http://localhost:3000',
            logo_url: 'http://localhost:3000/logo.png',
        }
    });

    console.log('Tests completed.');
}

testEmails().catch(console.error);
