import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';

/**
 * Perform auto-assignment for a conversation based on availability, capacity, and round-robin batch size.
 */
export async function performAutoAssignment(
    organization_id: string,
    conversation_id: string
) {
    try {
        console.log(`[Auto Assign] Evaluating assignment for conversation ${conversation_id} in org ${organization_id}`);

        // 1. Fetch organization settings
        const { data: org, error: orgErr } = await supabase
            .from("organizations")
            .select("settings")
            .eq("id", organization_id)
            .single();

        if (orgErr || !org?.settings?.auto_assign?.enabled) {
            console.log(`[Auto Assign] Auto-assign disabled or error fetching org settings for org ${organization_id}`);
            return;
        }

        const config = org.settings.auto_assign;
        const batchSize = Math.max(1, config.batch_size || 1);
        const pausedAgents = config.paused_agents || [];
        let state = config.state || { last_agent_id: null, current_batch_count: 0 };

        // 2. Fetch eligible agents (role is agent, admin, or owner, active - including offline agents)
        const { data: members, error: memErr } = await supabase
            .from("organization_members")
            .select("user_id, name, role, is_active, is_online")
            .eq("organization_id", organization_id)
            .in("role", ["agent", "admin", "owner"])
            .eq("is_active", true);

        if (memErr || !members || members.length === 0) {
            console.log(`[Auto Assign] No online active agents found for org ${organization_id}. Triggering fallback.`);
            await applyFallbackState(conversation_id);
            return;
        }

        // Filter out paused agents
        const activeEligibleAgents = members.filter(
            (m: any) => !pausedAgents.includes(m.user_id)
        );

        if (activeEligibleAgents.length === 0) {
            console.log(`[Auto Assign] All online active agents are paused. Triggering fallback.`);
            await applyFallbackState(conversation_id);
            return;
        }

        // 3. Check capacities of active eligible agents
        const { data: activeConvs, error: activeErr } = await supabase
            .from('w_conversations')
            .select('assigned_to')
            .eq('organization_id', organization_id)
            .eq('status', 'open')
            .not('assigned_to', 'is', null);

        if (activeErr) {
            console.error("[Auto Assign] Error querying active conversation counts:", activeErr);
            return;
        }

        const activeCounts: Record<string, number> = {};
        if (activeConvs) {
            for (const c of activeConvs) {
                if (c.assigned_to) {
                    activeCounts[c.assigned_to] = (activeCounts[c.assigned_to] || 0) + 1;
                }
            }
        }

        // Read capacity limit
        const maxChats = config.max_chats !== undefined 
            ? Number(config.max_chats) 
            : (config.max_chats_per_agent !== undefined ? Number(config.max_chats_per_agent) : null);

        // Filter agents under capacity
        const eligibleAgents = activeEligibleAgents.filter((m: any) => {
            const currentCount = activeCounts[m.user_id] || 0;
            return maxChats === null || currentCount < maxChats;
        });

        if (eligibleAgents.length === 0) {
            console.log(`[Auto Assign] All eligible agents are at maximum capacity (${maxChats} chats). Triggering fallback.`);
            await applyFallbackState(conversation_id);
            return;
        }

        const eligibleIds = eligibleAgents.map((m: any) => m.user_id);

        // 4. Determine next agent using round-robin batch logic
        let nextAgentId = eligibleIds[0];
        let newBatchCount = 1;

        if (state.last_agent_id && eligibleIds.includes(state.last_agent_id)) {
            const lastAgentCount = activeCounts[state.last_agent_id] || 0;
            if (state.current_batch_count < batchSize && (maxChats === null || lastAgentCount < maxChats)) {
                // Keep assigning to the same agent
                nextAgentId = state.last_agent_id;
                newBatchCount = state.current_batch_count + 1;
            } else {
                // Move to the next eligible agent
                const currentIndex = eligibleIds.indexOf(state.last_agent_id);
                const nextIndex = (currentIndex + 1) % eligibleIds.length;
                nextAgentId = eligibleIds[nextIndex];
                newBatchCount = 1;
            }
        } else {
            // Last agent not in the eligible pool, select first eligible under capacity
            nextAgentId = eligibleIds[0];
            newBatchCount = 1;
        }

        // 5. Update conversation atomically to prevent double-assignment / race conditions
        const { data: updatedConv, error: updErr } = await supabase
            .from('w_conversations')
            .update({
                assigned_to: nextAgentId,
                assigned_agent_id: nextAgentId,
                handoff_status: 'human_active'
            })
            .eq('id', conversation_id)
            .is('assigned_to', null) // Atomic check
            .select()
            .single();

        if (updErr || !updatedConv) {
            console.log(`[Auto Assign] Conversation ${conversation_id} assignment skipped or already assigned concurrently.`);
            return;
        }

        const agentName = eligibleAgents.find((m: any) => m.user_id === nextAgentId)?.name || 'Agent';

        // 6. Broadcast assignment events
        console.log(`[Auto Assign] Successfully assigned conversation ${conversation_id} to ${agentName} (${nextAgentId})`);
        
        io.to(`org:${organization_id}`).emit('conversation_assigned', {
            conversation_id,
            assigned_to: nextAgentId,
            assigned_agent_name: agentName
        });

        io.to(`org:${organization_id}`).emit('chat_assigned', {
            conversation_id,
            assigned_to: nextAgentId,
            assigned_agent_name: agentName
        });

        // 7. Update round-robin state in settings
        const newAutoAssign = {
            ...config,
            state: { last_agent_id: nextAgentId, current_batch_count: newBatchCount }
        };

        await supabase
            .from('organizations')
            .update({ settings: { ...org.settings, auto_assign: newAutoAssign } })
            .eq('id', organization_id);

        // 8. Check if capacity reached for this agent after assignment
        if (maxChats !== null) {
            const finalCount = (activeCounts[nextAgentId] || 0) + 1;
            if (finalCount >= maxChats) {
                console.log(`[Auto Assign] Agent ${agentName} has reached max capacity of ${maxChats} chats.`);
                io.to(`org:${organization_id}`).emit('capacity_reached', {
                    agent_id: nextAgentId,
                    capacity: maxChats
                });
            }
        }

    } catch (err) {
        console.error("[Auto Assign Error]", err);
    }
}

/**
 * Apply fallback unassigned state to a conversation when no eligible agents are available.
 */
async function applyFallbackState(conversation_id: string) {
    try {
        const { error } = await supabase
            .from("w_conversations")
            .update({
                assigned_to: null,
                assigned_agent_id: null,
                handoff_status: 'handoff_requested'
            })
            .eq("id", conversation_id);

        if (error) {
            console.error("[Auto Assign] Failed to apply fallback state to conversation:", error.message);
        }
    } catch (err) {
        console.error("[Auto Assign] Error applying fallback state:", err);
    }
}

/**
 * Reassign all unassigned pending conversations to online agents.
 */
export async function reassignPendingChats(organization_id: string) {
    try {
        console.log(`[Auto Assign] Re-evaluating pending chats for organization ${organization_id}`);

        // Fetch all conversations that are open and unassigned (or in handoff_requested state)
        const { data: pendingChats, error } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('organization_id', organization_id)
            .eq('status', 'open')
            .or('assigned_to.is.null,handoff_status.eq.handoff_requested');

        if (error) {
            console.error("[Auto Assign] Error fetching pending chats:", error);
            return;
        }

        if (!pendingChats || pendingChats.length === 0) {
            console.log(`[Auto Assign] No pending unassigned chats to reassign in org ${organization_id}`);
            return;
        }

        console.log(`[Auto Assign] Found ${pendingChats.length} pending chats to auto-assign.`);

        // Sequentially assign pending chats
        for (const chat of pendingChats) {
            await performAutoAssignment(organization_id, chat.id);
        }
    } catch (err) {
        console.error("[Auto Assign] Error reassigning pending chats:", err);
    }
}
