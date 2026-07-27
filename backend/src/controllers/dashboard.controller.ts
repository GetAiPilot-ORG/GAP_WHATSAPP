import { Response } from 'express';
import { supabase } from '../config/supabase.js';

export async function getDashboardStats(req: any, res: Response) {
    try {
        const organization_id = req.organization_id;
        const range = String(req.query.range || 'today').toLowerCase();
        const now = new Date();
        const start = new Date(now);

        if (range === '7d' || range === '7days') start.setDate(now.getDate() - 6);
        else if (range === '30d' || range === '30days') start.setDate(now.getDate() - 29);
        else start.setHours(0, 0, 0, 0);

        const startIso = start.toISOString();

        const optional = async <T>(fallback: T, fn: () => Promise<T>) => {
            try { return await fn(); }
            catch (error: any) {
                console.warn('[dashboard-stats] optional block failed:', error?.message || error);
                return fallback;
            }
        };

        const messageQuery = supabase
            .from('w_messages')
            .select('id, status, direction, sender_type, is_bot_reply, automation_source, created_at, content, conversation_id, contact:w_contacts(name, phone)')
            .eq('organization_id', organization_id)
            .gte('created_at', startIso)
            .order('created_at', { ascending: false })
            .limit(5000);

        const [
            messagesResult,
            contactsCountResult,
            savedContactsResult,
            conversationsResult,
            accountsResult,
            flowsResult,
            notesCount,
            campaigns,
        ] = await Promise.all([
            messageQuery,
            supabase
                .from('w_contacts')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .or('contact_type.eq.individual,contact_type.is.null')
                .not('saved_at', 'is', null),
            supabase
                .from('w_contacts')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organization_id)
                .or('contact_type.eq.individual,contact_type.is.null')
                .not('saved_at', 'is', null),
            supabase
                .from('w_conversations')
                .select('id, handoff_status, summary_status, bot_enabled, unread_count, last_message_at, created_at')
                .eq('organization_id', organization_id)
                .order('last_message_at', { ascending: false })
                .limit(1000),
            supabase
                .from('w_wa_accounts')
                .select('id, name, display_phone_number, status, created_at')
                .eq('organization_id', organization_id),
            optional({ data: [], error: null } as any, async () => supabase
                .from('w_flows')
                .select('id, name, status, current_version_id, updated_at')
                .eq('organization_id', organization_id)
                .neq('status', 'archived')),
            optional(0, async () => {
                const { count, error } = await supabase
                    .from('w_conversation_notes')
                    .select('*', { count: 'exact', head: true })
                    .eq('organization_id', organization_id)
                    .gte('created_at', startIso);
                if (error) throw error;
                return count || 0;
            }),
            optional([] as any[], async () => {
                const { data, error } = await supabase
                    .from('w_campaigns')
                    .select('id, name, status, total_contacts, sent_count, failed_count, created_at, scheduled_at')
                    .eq('organization_id', organization_id)
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (error) throw error;
                return data || [];
            }),
        ]);

        if (messagesResult.error) throw messagesResult.error;
        if (contactsCountResult.error) throw contactsCountResult.error;
        if (savedContactsResult.error) throw savedContactsResult.error;
        if (conversationsResult.error) throw conversationsResult.error;
        if (accountsResult.error) throw accountsResult.error;
        if (flowsResult.error) throw flowsResult.error;

        const messages = messagesResult.data || [];
        const conversations = conversationsResult.data || [];
        const accounts = accountsResult.data || [];
        const flows = flowsResult.data || [];

        const counts = { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, inbound: 0, outbound: 0, customer: 0, humanAgent: 0, aiAgent: 0, system: 0, broadcast: 0, flow: 0 };
        const dailyMap = new Map<string, any>();
        const hourlyMap = new Map<string, any>();

        messages.forEach((m: any) => {
            const status = String(m.status || '').toLowerCase();
            const senderType = String(m.sender_type || '').toLowerCase();
            const automationSource = String(m.automation_source || '').toLowerCase();
            if (status === 'sent') counts.sent++;
            else if (status === 'delivered') counts.delivered++;
            else if (status === 'read') counts.read++;
            else if (status === 'failed') counts.failed++;
            else counts.pending++;

            if (m.direction === 'inbound') counts.inbound++;
            if (m.direction === 'outbound') counts.outbound++;
            if (senderType === 'customer') counts.customer++;
            if (senderType === 'human_agent') counts.humanAgent++;
            if (senderType === 'ai_agent' || m.is_bot_reply) counts.aiAgent++;
            if (senderType === 'system') counts.system++;
            if (automationSource === 'broadcast') counts.broadcast++;
            if (automationSource === 'flow') counts.flow++;

            const day = new Date(m.created_at).toISOString().slice(0, 10);
            const row = dailyMap.get(day) || { date: day, total: 0, inbound: 0, outbound: 0, failed: 0, read: 0 };
            row.total++;
            if (m.direction === 'inbound') row.inbound++;
            if (m.direction === 'outbound') row.outbound++;
            if (status === 'failed') row.failed++;
            if (status === 'read') row.read++;
            dailyMap.set(day, row);

            const createdAt = new Date(m.created_at);
            const hour = `${String(createdAt.getHours()).padStart(2, '0')}:00`;
            const hourRow = hourlyMap.get(hour) || { hour, total: 0, inbound: 0, outbound: 0, failed: 0, read: 0 };
            hourRow.total++;
            if (m.direction === 'inbound') hourRow.inbound++;
            if (m.direction === 'outbound') hourRow.outbound++;
            if (status === 'failed') hourRow.failed++;
            if (status === 'read') hourRow.read++;
            hourlyMap.set(hour, hourRow);
        });

        const hourlyTimeline = Array.from({ length: 24 }).map((_, hourIndex) => {
            const hour = `${String(hourIndex).padStart(2, '0')}:00`;
            return hourlyMap.get(hour) || { hour, total: 0, inbound: 0, outbound: 0, failed: 0, read: 0 };
        });

        const total = messages.length;
        const readRate = total > 0 ? (counts.read / total) * 100 : 0;
        const deliveryRate = total > 0 ? ((counts.delivered + counts.read) / total) * 100 : 0;
        const failureRate = total > 0 ? (counts.failed / total) * 100 : 0;

        const humanHandoff = conversations.filter((c: any) => ['handoff_requested', 'human_active'].includes(c.handoff_status)).length;
        const summariesReady = conversations.filter((c: any) => c.summary_status === 'ready').length;
        const unread = conversations.reduce((sum: number, c: any) => sum + Number(c.unread_count || 0), 0);

        const activeAccounts = accounts.filter((a: any) => a.status !== 'disconnected').length;
        const publishedFlows = flows.filter((f: any) => f.current_version_id || f.status === 'published').length;
        const totalCampaigns = campaigns.length;
        const sentCampaignMessages = campaigns.reduce((sum: number, c: any) => sum + Number(c.sent_count || 0), 0);
        const failedCampaignMessages = campaigns.reduce((sum: number, c: any) => sum + Number(c.failed_count || 0), 0);

        const latestMessage = messages[0];
        const recentMessages = messages.slice(0, 6).map((m: any) => {
            const content = typeof m.content === 'string'
                ? m.content
                : (m.content?.text || m.content?.body || m.content?.caption || m.content?.type || 'Message');
            const contact = Array.isArray(m.contact) ? m.contact[0] : m.contact;
            return {
                id: m.id,
                kind: 'message',
                title: m.direction === 'inbound' ? 'New customer message' : (m.sender_type === 'ai_agent' || m.is_bot_reply ? 'Automation replied' : 'Team reply sent'),
                description: String(content || 'Message').slice(0, 140),
                meta: contact?.name || contact?.phone || m.status || 'Conversation',
                status: m.status || m.direction,
                created_at: m.created_at,
            };
        });

        res.json({
            range,
            generated_at: new Date().toISOString(),
            metrics: {
                totalMessages: total,
                delivered: counts.delivered + counts.read,
                sent: counts.sent,
                read: counts.read,
                failed: counts.failed,
                pending: counts.pending,
                readRate: Math.round(readRate),
                failedRate: Number(failureRate.toFixed(1)),
                deliveryRate: Math.round(deliveryRate),
                inbound: counts.inbound,
                outbound: counts.outbound,
                customer: counts.customer,
                humanAgent: counts.humanAgent,
                aiAgent: counts.aiAgent,
                system: counts.system,
                broadcast: counts.broadcast,
                flow: counts.flow,
            },
            contacts: {
                total: contactsCountResult.count || 0,
                saved: savedContactsResult.count || 0,
            },
            conversations: {
                total: conversations.length,
                humanHandoff,
                botActive: conversations.filter((c: any) => c.bot_enabled !== false && c.handoff_status === 'bot_active').length,
                summariesReady,
                unread,
            },
            accounts: {
                total: accounts.length,
                active: activeAccounts,
                connected: accounts.map((a: any) => ({
                    id: a.id,
                    name: a.name,
                    display_phone_number: a.display_phone_number,
                    status: a.status,
                })),
            },
            automation: {
                flows: flows.length,
                publishedFlows,
                activeFlowSessions: conversations.filter((c: any) => c.bot_enabled !== false).length,
                notesGenerated: notesCount,
            },
            campaigns: {
                total: totalCampaigns,
                sent: sentCampaignMessages,
                failed: failedCampaignMessages,
                latest: campaigns.slice(0, 5),
            },
            health: {
                status: failureRate > 15 ? 'red' : (failureRate > 5 ? 'yellow' : 'green'),
                quality: Math.max(0, 100 - Math.round(failureRate * 2)),
                lastMessageAt: latestMessage?.created_at || null,
            },
            timeline: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
            hourlyTimeline,
            recentActivity: recentMessages,
        });
    } catch (err: any) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ error: err.message });
    }
}
