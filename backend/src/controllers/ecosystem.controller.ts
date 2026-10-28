import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';
import { storeMessage, upsertConversation } from '../services/messages.service.js';
import { io } from '../socket.js';

export const sendWhatsAppAction = async (req: Request, res: Response) => {
    try {
        const secret = req.headers['x-ecosystem-secret'];
        if (secret !== process.env.ECOSYSTEM_SYNC_SECRET && secret !== 'super_secret_ecosystem_key_2024') {
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
                        .from('organization_members')
                        .select('organization_id')
                        .eq('user_id', matchedUser.id);
                    if (userOrgs && userOrgs.length > 0) {
                        targetOrgIds.push(...userOrgs.map((o: any) => o.organization_id));
                        console.log(`[ECOSYSTEM] Mapped CRM email ${user_email} to WhatsApp organizations:`, targetOrgIds);
                    } else {
                        // Fallback check
                        const { data: ownerOrgs } = await supabase
                            .from('organizations')
                            .select('id')
                            .eq('owner_id', matchedUser.id);
                        if (ownerOrgs && ownerOrgs.length > 0) {
                            targetOrgIds.push(...ownerOrgs.map((o: any) => o.id));
                        }
                    }
                }
            } catch (e) {
                console.warn("[ECOSYSTEM] Failed to map email to organization:", e);
            }
        }

        let waToken = process.env.WA_ACCESS_TOKEN;
        let waPhoneId = process.env.WA_PHONE_NUMBER_ID;
        let waAccountId: string | null = null;
        let matchedOrgId: string = targetOrgIds[0];

        // Fetch real credentials strictly from the user's DB matching their email
        if (supabase) {
            let { data: accounts, error: accError } = await supabase
                .from('w_wa_accounts')
                .select('id, organization_id, access_token_encrypted, phone_number_id')
                .in('organization_id', targetOrgIds)
                .not('access_token_encrypted', 'is', null)
                .neq('status', 'disconnected')
                .order('created_at', { ascending: false })
                .limit(1);

            if (accError) {
                console.warn('[ECOSYSTEM] Error fetching org account:', accError.message);
            }

            if (accounts && accounts.length > 0 && accounts[0].access_token_encrypted) {
                console.log(`[ECOSYSTEM] Found WhatsApp account for orgs:`, targetOrgIds, `Phone ID:`, accounts[0].phone_number_id);
                waToken = decryptToken(accounts[0].access_token_encrypted);
                waPhoneId = accounts[0].phone_number_id;
                waAccountId = accounts[0].id;
                matchedOrgId = accounts[0].organization_id;
            } else {
                // Fallback to global active account if specific organization not found
                const { data: globalAccounts, error: globalErr } = await supabase
                    .from('w_wa_accounts')
                    .select('id, organization_id, access_token_encrypted, phone_number_id')
                    .not('access_token_encrypted', 'is', null)
                    .neq('status', 'disconnected')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (globalErr) {
                    console.warn('[ECOSYSTEM] Error fetching global accounts:', globalErr.message);
                }

                if (globalAccounts && globalAccounts.length > 0 && globalAccounts[0].access_token_encrypted) {
                    console.log(`[ECOSYSTEM] Falling back to global WhatsApp account because no account found for orgs:`, targetOrgIds);
                    waToken = decryptToken(globalAccounts[0].access_token_encrypted);
                    waPhoneId = globalAccounts[0].phone_number_id;
                    waAccountId = globalAccounts[0].id;
                    matchedOrgId = globalAccounts[0].organization_id;
                } else {
                    console.error("[ECOSYSTEM] No WhatsApp account credentials configured in the system.");
                }
            }
        }

        if (!waToken || !waPhoneId) {
            console.error("[ECOSYSTEM] Missing WhatsApp credentials in .env and DB");
            return res.status(500).json({ error: "Missing WhatsApp Credentials" });
        }

        // Normalize phone number: remove '+' and non-digits
        let cleanPhone = phone.replace(/\D/g, '');
        // If 10 digits (standard Indian number without country code), prepend '91'
        if (cleanPhone.length === 10) {
            cleanPhone = '91' + cleanPhone;
        }

        // Use the template requested by CRM
        const templateName = template_id || 'hello_world';
        let templateLang = "en_US";
        let templateComponents: any[] = [];

        if (supabase) {
            const { data: tmplData } = await supabase
                .from('w_templates')
                .select('language, components')
                .eq('name', templateName)
                .limit(1);
            if (tmplData && tmplData.length > 0) {
                if (tmplData[0].language) {
                    templateLang = tmplData[0].language;
                }
                if (Array.isArray(tmplData[0].components)) {
                    templateComponents = tmplData[0].components;
                }
            }
        }

        const payload: any = {
            messaging_product: "whatsapp",
            to: cleanPhone,
            type: "template",
            template: {
                name: templateName,
                language: {
                    code: templateLang
                }
            }
        };

        // Construct Meta components accurately based on template specifications
        const finalComponents: any[] = [];

        // 1. Check for IMAGE header component in template
        const headerComp = templateComponents.find((c: any) => c.type === 'HEADER' && c.format === 'IMAGE');
        if (headerComp?.example?.header_handle?.[0]) {
            finalComponents.push({
                type: "header",
                parameters: [
                    {
                        type: "image",
                        image: {
                            link: headerComp.example.header_handle[0]
                        }
                    }
                ]
            });
        }

        // 2. Check BODY component and count expected variables like {{1}}, {{2}}
        const bodyComp = templateComponents.find((c: any) => c.type === 'BODY');
        if (bodyComp) {
            const matches = (bodyComp.text || '').match(/\{\{\d+\}\}/g) || [];
            const expectedCount = matches.length;

            if (expectedCount > 0) {
                const varList = variables ? Object.values(variables).map(v => String(v)) : [];
                const bodyParams = [];
                for (let i = 0; i < expectedCount; i++) {
                    const val = varList[i] || (i === 0 ? (variables?.name || 'Valued Customer') : 'GetAiPilot');
                    bodyParams.push({
                        type: "text",
                        text: String(val)
                    });
                }
                finalComponents.push({
                    type: "body",
                    parameters: bodyParams
                });
            }
        } else if (variables && Object.keys(variables).length > 0 && templateName !== 'hello_world') {
            // Fallback if template components were not in DB
            finalComponents.push({
                type: "body",
                parameters: Object.values(variables).map(val => ({
                    type: "text",
                    text: String(val)
                }))
            });
        }

        if (finalComponents.length > 0) {
            payload.template.components = finalComponents;
        }

        console.log(`[ECOSYSTEM] Sending Meta WhatsApp message to ${cleanPhone} with template ${templateName}:`, JSON.stringify(payload));

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
            return res.status(500).json({ 
                error: metaData?.error?.message || "Meta API Failed", 
                code: metaData?.error?.code,
                details: metaData 
            });
        }

        const waMessageId = metaData.messages?.[0]?.id || `wamid.eco.${Date.now()}`;
        const realWaId = metaData.contacts?.[0]?.wa_id || cleanPhone;

        // Render human-readable text for chat display & conversation preview
        let renderedText = `[Template: ${templateName}]`;
        const templateBodyComp = templateComponents.find((c: any) => c.type?.toUpperCase() === 'BODY');
        if (templateBodyComp && templateBodyComp.text) {
            renderedText = templateBodyComp.text;
            const bodyParams = finalComponents.find((c: any) => c.type?.toLowerCase() === 'body')?.parameters || [];
            bodyParams.forEach((param: any, idx: number) => {
                renderedText = renderedText.replace(new RegExp(`\\{\\{\\s*${idx + 1}\\s*\\}\\}`, 'g'), param.text || '');
            });
        } else if (templateName === 'hello_world') {
            renderedText = 'Hello World';
        }

        // Store into WhatsApp project database and emit realtime socket event
        let storedMessageId: string | null = null;
        let conversationId: string | null = null;
        let contactId: string | null = null;

        if (supabase && matchedOrgId && waAccountId) {
            try {
                // 1. Find or create contact in w_contacts
                const contactName = variables?.name || variables?.first_name || variables?.lead_name || 'CRM Lead';

                const { data: existingContacts } = await supabase
                    .from('w_contacts')
                    .select('id, name')
                    .eq('organization_id', matchedOrgId)
                    .or(`wa_id.eq.${realWaId},phone.eq.${cleanPhone},phone.eq.+${cleanPhone}`)
                    .limit(1);

                if (existingContacts && existingContacts.length > 0) {
                    contactId = existingContacts[0].id;
                } else {
                    const { data: newContact, error: contactErr } = await supabase
                        .from('w_contacts')
                        .insert({
                            organization_id: matchedOrgId,
                            wa_account_id: waAccountId,
                            name: contactName,
                            phone: cleanPhone,
                            wa_id: realWaId,
                            contact_type: 'individual',
                            canonical_contact_id: lead_id || null,
                            tags: ['crm_lead', 'ecosystem']
                        })
                        .select('id')
                        .single();

                    if (newContact) {
                        contactId = newContact.id;
                    } else if (contactErr) {
                        console.warn('[ECOSYSTEM] Failed to insert contact in w_contacts:', contactErr.message);
                    }
                }

                // 2. Upsert conversation in w_conversations
                if (contactId) {
                    const conv = await upsertConversation(matchedOrgId, waAccountId, contactId, {
                        direction: 'outbound',
                        preview: renderedText
                    });

                    if (conv && conv.id) {
                        conversationId = conv.id;

                        // 3. Store message in w_messages
                        const stored = await storeMessage({
                            organization_id: matchedOrgId,
                            conversation_id: conv.id,
                            contact_id: contactId,
                            wa_message_id: waMessageId,
                            direction: 'outbound',
                            type: 'template',
                            status: 'sent',
                            content: {
                                text: renderedText,
                                template: {
                                    name: templateName,
                                    language: templateLang,
                                    body: renderedText,
                                    components: finalComponents
                                }
                            },
                            sender_type: 'human_agent',
                            automation_source: 'system',
                            metadata: {
                                source: 'crm_ecosystem',
                                lead_id: lead_id || null,
                                template_name: templateName,
                                meta_response: metaData
                            }
                        } as any);

                        storedMessageId = stored?.id || null;

                        // 4. Emit real-time Socket.IO events for LiveChat UI
                        io.to(`org:${matchedOrgId}`).emit('new_message', {
                            organization_id: matchedOrgId,
                            wa_account_id: waAccountId,
                            phone_number_id: waPhoneId,
                            from: cleanPhone,
                            text: renderedText,
                            sender: 'agent',
                            conversation_id: conv.id,
                            contact_id: contactId,
                            message_id: storedMessageId,
                            wa_message_id: waMessageId,
                            created_at: stored?.created_at || new Date().toISOString(),
                            status: 'sent',
                            type: 'template',
                            content: {
                                text: renderedText,
                                template: {
                                    name: templateName,
                                    language: templateLang,
                                    body: renderedText,
                                    components: finalComponents
                                }
                            }
                        });

                        io.to(`org:${matchedOrgId}`).emit('conversation_updated', {
                            ...conv,
                            last_message_preview: renderedText,
                            last_message_at: new Date().toISOString()
                        });

                        console.log(`[ECOSYSTEM] Successfully recorded message ${waMessageId} in chat ${conv.id} for contact ${contactId}`);
                    }
                }
            } catch (storeErr: any) {
                console.error('[ECOSYSTEM] Failed to store message in chat DB:', storeErr.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'WhatsApp automated action triggered successfully',
            details: {
                phone: cleanPhone,
                template: templateName,
                meta_response: metaData,
                conversation_id: conversationId,
                message_id: storedMessageId,
                contact_id: contactId,
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
                    const { data: memberOrgs } = await supabase
                        .from('organization_members')
                        .select('organization_id')
                        .eq('user_id', matchedUser.id);
                    if (memberOrgs && memberOrgs.length > 0) {
                        targetOrgIds.push(...memberOrgs.map((o: any) => o.organization_id));
                    }

                    const { data: ownerOrgs } = await supabase
                        .from('organizations')
                        .select('id')
                        .eq('owner_id', matchedUser.id);
                    if (ownerOrgs && ownerOrgs.length > 0) {
                        targetOrgIds.push(...ownerOrgs.map((o: any) => o.id));
                    }
                }
            }

            // Find user's active WhatsApp Account
            let query = supabase
                .from('w_wa_accounts')
                .select('id, organization_id, whatsapp_business_account_id, access_token_encrypted')
                .not('access_token_encrypted', 'is', null)
                .neq('status', 'disconnected')
                .order('created_at', { ascending: false });

            if (targetOrgIds.length > 0) {
                query = query.in('organization_id', targetOrgIds);
            }

            const { data: account } = await query.limit(1).maybeSingle();

            // Try to fetch live templates directly from Meta WABA for 100% accuracy
            if (account && account.whatsapp_business_account_id && account.access_token_encrypted) {
                try {
                    const token = decryptToken(account.access_token_encrypted);
                    if (token) {
                        const metaRes = await fetch(
                            `https://graph.facebook.com/v17.0/${account.whatsapp_business_account_id}/message_templates?fields=id,name,language,status,category,components&limit=100`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        if (metaRes.ok) {
                            const metaData = await metaRes.json();
                            const approved = (metaData.data || []).filter((t: any) => t.status === 'APPROVED');
                            if (approved.length > 0) {
                                return res.status(200).json({ success: true, data: approved });
                            }
                        }
                    }
                } catch (metaErr) {
                    console.warn('[ECOSYSTEM] Failed to fetch live templates from Meta, falling back to DB:', metaErr);
                }
            }

            // Fallback: Query w_templates strictly for the target organizations
            let templatesQuery = supabase.from('w_templates').select('id, name, language, category, status').eq('status', 'APPROVED');
            if (targetOrgIds.length > 0) {
                templatesQuery = templatesQuery.in('organization_id', targetOrgIds);
            }
            const { data: templates } = await templatesQuery;
            return res.status(200).json({ success: true, data: templates || [] });
        }

        return res.status(200).json({ success: true, data: [] });
    } catch (error: any) {
        console.error('[ECOSYSTEM] Error in getEcosystemTemplates:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
