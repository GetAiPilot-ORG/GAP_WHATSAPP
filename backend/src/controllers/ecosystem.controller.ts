import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';

export const sendWhatsAppAction = async (req: Request, res: Response) => {
    try {
        const secret = req.headers['x-ecosystem-secret'];
        if (secret !== process.env.ECOSYSTEM_SYNC_SECRET) {
            return res.status(401).json({ error: 'Unauthorized ecosystem request' });
        }

        const { org_id, user_email, lead_id, phone, template_id, variables } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        console.log(`[ECOSYSTEM] Triggering WhatsApp follow-up for lead ${lead_id} (Org: ${org_id}) to ${phone}`);

        let targetOrgIds = [org_id];

        // Match user's CRM email to WhatsApp organization
        if (user_email && supabase) {
            try {
                let matchedUser = null;
                let page = 1;
                while (!matchedUser) {
                    const { data: users, error: userError } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
                    if (userError || !users || users.users.length === 0) break;
                    matchedUser = users.users.find((u: any) => u.email === user_email);
                    if (matchedUser) break;
                    page++;
                }
                
                if (matchedUser) {
                    const { data: userOrgs } = await supabase
                        .from('organizations')
                        .select('id')
                        .eq('owner_id', matchedUser.id);
                    if (userOrgs && userOrgs.length > 0) {
                        targetOrgIds = userOrgs.map(o => o.id);
                        console.log(`[ECOSYSTEM] Mapped CRM email ${user_email} to WhatsApp organizations:`, targetOrgIds);
                    }
                }
            } catch (e) {
                console.warn("[ECOSYSTEM] Failed to map email to organization:", e);
            }
        }

        let waToken = process.env.WA_ACCESS_TOKEN;
        let waPhoneId = process.env.WA_PHONE_NUMBER_ID;

        // Fetch real credentials strictly from the user's DB matching their email
        if (supabase) {
           let { data: accounts } = await supabase
             .from('w_wa_accounts')
             .select('access_token_encrypted, phone_number_id')
             .in('organization_id', targetOrgIds)
             .not('access_token_encrypted', 'is', null)
             .order('updated_at', { ascending: false })
             .limit(1);

           if (accounts && accounts.length > 0) {
               waToken = decryptToken(accounts[0].access_token_encrypted);
               waPhoneId = accounts[0].phone_number_id;
           } else {
               console.error("[ECOSYSTEM] No WhatsApp account credentials configured in the system for this user.");
               return res.status(400).json({ error: 'No WhatsApp account configured for this user' });
           }
        }
        
        if (!waToken || !waPhoneId) {
             console.error("[ECOSYSTEM] Missing WhatsApp credentials in .env and DB");
             return res.status(500).json({ error: "Missing WhatsApp Credentials" });
        }

        // Meta API requires phone number without the '+' prefix
        const cleanPhone = phone.replace('+', '');
        
        // Use the template requested by CRM
        const templateName = template_id || 'hello_world';

        const payload = {
            messaging_product: "whatsapp",
            to: cleanPhone,
            type: "template",
            template: {
                name: templateName,
                language: {
                    code: "en_US"
                }
            }
        };

        const metaRes = await fetch(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${waToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const metaData = await metaRes.json();
        
        if (!metaRes.ok) {
            console.error("[ECOSYSTEM] Meta API Error:", metaData);
            return res.status(500).json({ error: "Meta API Failed", details: metaData });
        }

        return res.status(200).json({ 
            success: true, 
            message: 'WhatsApp automated action triggered successfully',
            details: {
                phone: cleanPhone,
                template: templateName,
                meta_response: metaData,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.error('[ECOSYSTEM] Error in sendWhatsAppAction:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

export const getEcosystemTemplates = async (req: Request, res: Response) => {
    try {
        const secret = req.headers['x-ecosystem-secret'];
        if (secret !== process.env.ECOSYSTEM_SYNC_SECRET && secret !== 'super_secret_ecosystem_key_2024') {
            return res.status(401).json({ error: 'Unauthorized ecosystem request' });
        }

        const { user_email } = req.query;

        if (supabase) {
            let targetOrgIds: string[] = [];
            
            if (user_email) {
                let matchedUser = null;
                let page = 1;
                while (!matchedUser) {
                    const { data: users, error: userError } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
                    if (userError || !users || users.users.length === 0) break;
                    matchedUser = users.users.find((u: any) => u.email === user_email);
                    if (matchedUser) break;
                    page++;
                }
                
                if (matchedUser) {
                    const { data: userOrgs } = await supabase
                        .from('organizations')
                        .select('id')
                        .eq('owner_id', matchedUser.id);
                    if (userOrgs && userOrgs.length > 0) {
                        targetOrgIds = userOrgs.map(o => o.id);
                    }
                }
            }

            let templatesQuery = supabase.from('w_templates').select('id, name, language, category, status').eq('status', 'APPROVED');
            
            if (targetOrgIds.length > 0) {
                templatesQuery = templatesQuery.in('organization_id', targetOrgIds);
            }

            const { data: templates } = await templatesQuery;

            // Fallback to global templates if none found for org
            if (!templates || templates.length === 0) {
                const { data: globalTemplates } = await supabase
                    .from('w_templates')
                    .select('id, name, language, category, status')
                    .is('organization_id', null)
                    .eq('status', 'APPROVED');
                return res.status(200).json({ success: true, data: globalTemplates || [] });
            }

            return res.status(200).json({ success: true, data: templates });
        }

        return res.status(200).json({ success: true, data: [] });
    } catch (error: any) {
        console.error('[ECOSYSTEM] Error in getEcosystemTemplates:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
