import { Response } from 'express';
import twilio from 'twilio';
import { supabase } from '../config/supabase.js';
import { enforcePlanResourceLimit } from '../services/billing.service.js';
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
let twilioClient: any = null;
if (TWILIO_SID && TWILIO_TOKEN) {
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
}

export async function searchAvailableNumbers(req: any, res: Response) {
    try {
        if (!twilioClient) {
            return res.status(500).json({ error: 'Twilio API keys not configured on server.' });
        }
        const { country = 'US' } = req.body;
        // Search local numbers
        const numbers = await twilioClient.availablePhoneNumbers(country).local.list({
            smsEnabled: true,
            voiceEnabled: true,
            limit: 10
        });
        res.json({ numbers });
    } catch (err: any) {
        console.error('[TWILIO SEARCH]', err);
        res.status(500).json({ error: err.message || 'Failed to search Twilio numbers' });
    }
}

export async function buyNumber(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        if (!twilioClient) {
            return res.status(500).json({ error: 'Twilio API keys not configured on server.' });
        }
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

        // Check if user has space for a new number limit
        await enforcePlanResourceLimit({
            organization_id: orgId,
            resource: 'numbers',
            table: 'w_wa_accounts',
            label: 'WhatsApp numbers'
        });

        // Buy the number
        const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
            phoneNumber,
            friendlyName: `GAP FlowPilot - Org ${orgId}`
        });

        // Save it to w_wa_accounts as a connected/setup number (or pending)
        const { data: acc, error: accErr } = await supabase.from('w_wa_accounts').insert({
            organization_id: orgId,
            phone_number: purchasedNumber.phoneNumber,
            display_phone_number: purchasedNumber.phoneNumber,
            status: 'PENDING_META_VERIFICATION', // Custom status telling the user to verify on Meta
            is_active: true
        }).select().single();

        if (accErr) throw accErr;

        res.json({ success: true, account: acc, twilio_number: purchasedNumber });
    } catch (err: any) {
        console.error('[TWILIO BUY]', err);
        res.status(500).json({ error: err.message || 'Failed to buy Twilio number' });
    }
}
