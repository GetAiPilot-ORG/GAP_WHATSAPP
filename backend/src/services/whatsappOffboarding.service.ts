import { supabase } from '../config/supabase.js';

export class WhatsAppOffboardedError extends Error {
    constructor() {
        super('This number has been disconnected from GetAIPilot');
    }
}

export async function assertWhatsAppSendingAllowed(phoneNumberId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from('w_wa_accounts')
        .select('offboarding_started_at')
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();
    // Prior to the migration, no number can have an offboarding record.
    if (error?.code === '42703') return;
    if (error) throw new Error('Could not verify WhatsApp sending status');
    if (data?.offboarding_started_at) throw new WhatsAppOffboardedError();
}
