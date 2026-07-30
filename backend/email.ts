import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables immediately in this module
dotenv.config();

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
    if (!transporter) {
        const transporterConfig: any = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        };
        transporter = nodemailer.createTransport(transporterConfig);
    }
    return transporter;
}

export async function sendEmail(to: string, subject: string, html: string) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️ SMTP credentials not set. Skipping email send.');
        return;
    }

    console.log('--- SENDING EMAIL ---');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('HTML Content:', html);
    console.log('---------------------');

    try {
        const info = await getTransporter().sendMail({
            from: `"${process.env.SMTP_FROM_NAME || 'GAP WhatsApp Pilot'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            html,
        });
        console.log('✉️ Email sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Failed to send email:', error);
        throw error;
    }
}
