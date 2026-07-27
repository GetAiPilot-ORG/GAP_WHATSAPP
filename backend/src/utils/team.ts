import crypto from 'crypto';
import { sendEmail } from '../../email.js';

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

    await sendEmail(
        params.email,
        `Invitation to join GAP FlowPilot Team`,
        `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invitation to join GAP FlowPilot Team</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap');
                @media screen and (max-width: 600px) {
                    .email-card {
                        border-radius: 8px !important;
                    }
                    .content-padding {
                        padding-left: 20px !important;
                        padding-right: 20px !important;
                    }
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Inter', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <div style="background-color: #f8fafc; padding: 40px 10px; min-height: 100vh;">
                <div class="email-card" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15,23,42,0.06);">
                    
                    <!-- Header Wordmark -->
                    <div class="content-padding" style="padding: 32px 48px 24px 48px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                        <img src="${logoUrl}" alt="GAP FlowPilot Logo" width="52" height="52" style="width: 52px; height: 52px; margin-bottom: 12px; display: inline-block; border: 0;" />
                        <br />
                        <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 28px; line-height: 0.95; tracking-tight; color: #0f172a; font-style: italic; display: inline-block;">
                            GAP FlowPilot
                        </span>
                        <div style="font-size: 11px; tracking-widest; letter-spacing: 0.22em; font-weight: 700; color: #047857; margin-top: 4px; text-transform: uppercase;">
                            INVITATION
                        </div>
                    </div>

                    <!-- Intro Headline -->
                    <div class="content-padding" style="padding: 32px 48px 12px 48px; text-align: center;">
                        <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 38px; line-height: 1.1; font-weight: normal; color: #0f172a; margin: 0 0 16px 0; font-style: italic;">
                            You have been invited to join the team
                        </h1>
                        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0; padding: 0 10px;">
                            Hello <strong style="color: #0f172a;">${params.name}</strong>, your workspace owner invited you to join the team as an <strong style="color: #0f172a;">${roleLabel}</strong>.
                        </p>
                    </div>

                    <!-- GIF Preview Card -->
                    <div class="content-padding" style="padding: 12px 48px 24px 48px; text-align: center;">
                        <div style="display: inline-block; width: 100%; max-width: 440px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(15,23,42,0.12);">
                            <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWRhMnQxNms1eTk5cm1rcXQwb3R1ZHgybXJ5dnpxaXBtdTZ4bnQ1ZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7qE1YN7aBOFPRw8E/giphy.gif" alt="WhatsApp Automation Animation" width="440" style="width: 100%; max-width: 440px; height: auto; display: block; border-radius: 12px; border: 0;" />
                        </div>
                    </div>

                    <!-- Centered Divider -->
                    <div style="text-align: center; padding: 12px 0;">
                        <div style="display: inline-block; height: 1px; width: 96px; background-color: #e2e8f0;"></div>
                    </div>

                    <!-- Steps list -->
                    <div class="content-padding" style="padding: 12px 48px 32px 48px; max-width: 480px; margin: 0 auto;">
                        
                        <!-- Step 1: Email -->
                        <div style="display: flex; align-items: flex-start; margin-bottom: 24px;">
                            <div style="flex-shrink: 0; width: 28px; height: 28px; border-radius: 6px; background: linear-gradient(135deg, #39e078 0%, #007a4a 100%); color: #ffffff; font-weight: bold; font-size: 13px; line-height: 28px; text-align: center; margin-right: 16px; margin-top: 2px;">
                                1
                            </div>
                            <div style="font-size: 16px; line-height: 1.5; color: #334155;">
                                <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; display: block; margin-bottom: 2px;">Your Login Email</span>
                                <strong style="color: #0f172a;">${params.email}</strong>
                            </div>
                        </div>

                        <!-- Step 2: Temporary Password -->
                        <div style="display: flex; align-items: flex-start; margin-bottom: 24px;">
                            <div style="flex-shrink: 0; width: 28px; height: 28px; border-radius: 6px; background: linear-gradient(135deg, #39e078 0%, #007a4a 100%); color: #ffffff; font-weight: bold; font-size: 13px; line-height: 28px; text-align: center; margin-right: 16px; margin-top: 2px;">
                                2
                            </div>
                            <div style="font-size: 16px; line-height: 1.5; color: #334155;">
                                <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; display: block; margin-bottom: 2px;">Temporary Password</span>
                                <strong style="color: #0f172a; letter-spacing: 1px;">${params.password}</strong>
                            </div>
                        </div>

                        <!-- Step 3: Accept Button -->
                        <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
                            <div style="flex-shrink: 0; width: 28px; height: 28px; border-radius: 6px; background: linear-gradient(135deg, #39e078 0%, #007a4a 100%); color: #ffffff; font-weight: bold; font-size: 13px; line-height: 28px; text-align: center; margin-right: 16px; margin-top: 2px;">
                                3
                            </div>
                            <div style="font-size: 16px; line-height: 1.5; color: #334155; width: 100%;">
                                <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; display: block; margin-bottom: 8px;">Accept Invitation & Setup Account</span>
                                <a href="${params.inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #39e078 0%, #007a4a 100%); color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; text-align: center; border: none; box-shadow: 0 4px 12px rgba(57, 224, 120, 0.25);">
                                    Accept Invitation
                                </a>
                            </div>
                        </div>

                    </div>

                    <!-- Security Notice / Expiry Info -->
                    <div class="content-padding" style="padding: 24px 48px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                        <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
                            This invitation link will expire on <strong style="color: #334155;">${expiresLabel}</strong>.<br>
                            For security, please change your temporary password immediately after logging in.
                        </p>
                    </div>

                    <!-- Footer -->
                    <footer style="background-color: #f8fafc; padding: 32px 48px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <a href="#" style="font-family: 'Instrument Serif', Georgia, serif; font-size: 24px; color: #0f172a; text-decoration: none; font-style: italic; display: inline-block; margin-bottom: 12px;">
                            GAP FlowPilot
                        </a>
                        <p style="margin: 0 auto 16px auto; max-width: 440px; color: #64748b; font-size: 11px; line-height: 1.6;">
                            This is an automated invitation sent from your organization workspace. Please do not reply directly to this email.
                        </p>
                        
                        <div style="height: 1px; width: 64px; background-color: #e2e8f0; margin: 0 auto 16px auto;"></div>
                        
                        <!-- Socials -->
                        <div style="font-size: 11px; color: #475569; margin-bottom: 20px; word-spacing: 6px;">
                            <a href="#" style="color: #475569; text-decoration: none;">Support</a>  |  
                            <a href="#" style="color: #475569; text-decoration: none;">Privacy</a>  |  
                            <a href="#" style="color: #475569; text-decoration: none;">Terms</a>
                        </div>

                        <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                            ©2026 GAP FlowPilot, 660 4th Street #443, San Francisco, CA 94107 USA
                        </p>
                    </footer>

                </div>
            </div>
        </body>
        </html>
        `
    );
}
