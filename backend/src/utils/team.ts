import crypto from 'crypto';

const INVITE_TTL_HOURS = 24;

export function createInviteToken() {
    return crypto.randomBytes(32).toString('base64url');
}

export function hashInviteToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function createTemporaryPassword() {
    return `Flow-${crypto.randomBytes(6).toString('base64url')}`;
}

export function getInviteExpiryDate() {
    return new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

export function getFrontendBaseUrl() {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
}

export function getMemberInviteState(member: any) {
    if (member?.invite_accepted_at || member?.is_active) return 'active';
    const expiresAt = member?.invite_expires_at ? new Date(member.invite_expires_at) : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) return 'expired';
    return 'pending';
}

export async function sendTeamInviteEmail(params: {
    email: string;
    name: string;
    role: string;
    password: string;
    inviteLink: string;
    expiresAt: Date;
}) {
    const roleLabel = String(params.role || 'agent').charAt(0).toUpperCase() + String(params.role || 'agent').slice(1);
    const expiresLabel = params.expiresAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const frontendUrl = process.env.FRONTEND_URL || 'https://wb.getaipilot.in';
    const logoUrl = `${frontendUrl}/logo.png`;

    const { sendTransactionalEmail } = await import('../services/supermailbox.service.js');
    await sendTransactionalEmail({
        to: params.email,
        productCode: 'GAP_WHATSAPP',
        templateKey: 'team_invite',
        idempotencyKey: `gap_whatsapp_team_invite_${params.email}`,
        variables: {
            full_name: params.name,
            role: roleLabel,
            password: params.password,
            invite_link: params.inviteLink,
            expires_at: expiresLabel,
            frontend_url: frontendUrl,
            logo_url: logoUrl
        }
    });
}
