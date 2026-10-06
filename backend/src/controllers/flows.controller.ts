import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { enforcePlanResourceLimit } from '../services/billing.service.js';
import {
    getFlowTriggerKeywords,
    normalizeFlowAccountScope,
    normalizeFlowAccountIds,
    validateFlowDefinition,
    findFlowTriggerConflicts,
    insertFlowVersionWithSchemaFallback
} from '../services/flows.service.js';
import { invalidateFlowsCache } from '../services/ai.service.js';

export async function getFlows(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('organization_id', orgId)
            .neq('status', 'archived')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getFlowById(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Flow not found' });
        res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function createFlow(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
        const startNode = nodes.find((n: any) => n?.type === 'startBotFlow');
        const matchType = String(req.body?.match_type || startNode?.data?.config?.matchType || startNode?.data?.matchType || 'string').toLowerCase().trim();
        const triggerKeywords = getFlowTriggerKeywords({ ...req.body, nodes }, nodes);
        const waAccountScope = normalizeFlowAccountScope(req.body?.wa_account_scope);
        const waAccountIds = waAccountScope === 'selected' ? normalizeFlowAccountIds(req.body?.wa_account_ids) : [];
        const payload = {
            name: String(req.body?.name || '').trim(),
            description: req.body?.description || null,
            status: req.body?.status === 'active' ? 'draft' : (req.body?.status || 'draft'),
            trigger_type: req.body?.trigger_type || 'keyword',
            trigger_keywords: triggerKeywords,
            triggers: triggerKeywords,
            match_type: matchType,
            wa_account_scope: waAccountScope,
            wa_account_ids: waAccountIds,
            nodes,
            edges: Array.isArray(req.body?.edges) ? req.body.edges : [],
            organization_id: orgId,
            created_by_user_id: req.user?.id || null,
            updated_by_user_id: req.user?.id || null,
        };
        if (!payload.name) return res.status(400).json({ error: 'Flow name is required' });
        await enforcePlanResourceLimit({
            organization_id: orgId,
            resource: 'flows',
            table: 'w_flows',
            filters: { status: ['draft', 'active', 'paused'] },
            label: 'Flow',
        });
        const { data, error } = await supabase.from('w_flows').insert(payload).select().single();
        if (error) throw error;
        invalidateFlowsCache(orgId);
        res.status(201).json(data);
    } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message, limit: e.limit }); }
}

export async function updateFlow(req: any, res: Response) {
    const { id } = req.params;
    const orgId = req.organization_id;
    try {
        const updateData: any = {};
        if (req.body.name !== undefined) updateData.name = String(req.body.name || '').trim();
        if (req.body.description !== undefined) updateData.description = req.body.description || null;
        if (req.body.nodes !== undefined) updateData.nodes = Array.isArray(req.body.nodes) ? req.body.nodes : [];
        if (req.body.edges !== undefined) updateData.edges = Array.isArray(req.body.edges) ? req.body.edges : [];
        if (req.body.trigger_type !== undefined) updateData.trigger_type = req.body.trigger_type || 'keyword';
        if (req.body.wa_account_scope !== undefined || req.body.wa_account_ids !== undefined) {
            updateData.wa_account_scope = normalizeFlowAccountScope(req.body.wa_account_scope);
            updateData.wa_account_ids = updateData.wa_account_scope === 'selected'
                ? normalizeFlowAccountIds(req.body.wa_account_ids)
                : [];
        }
        if (req.body.status !== undefined && ['draft', 'paused', 'archived'].includes(req.body.status)) updateData.status = req.body.status;
        if (updateData.nodes !== undefined || req.body.triggers !== undefined || req.body.trigger_keywords !== undefined || req.body.match_type !== undefined) {
            const nodes = updateData.nodes !== undefined ? updateData.nodes : req.body.nodes;
            const startNode = (nodes || []).find((n: any) => n?.type === 'startBotFlow');
            const matchType = String(req.body.match_type || startNode?.data?.config?.matchType || startNode?.data?.matchType || 'string').toLowerCase().trim();
            const triggerKeywords = getFlowTriggerKeywords({ ...req.body, nodes }, nodes);
            updateData.trigger_keywords = triggerKeywords;
            updateData.triggers = triggerKeywords;
            updateData.match_type = matchType;
        }
        updateData.updated_at = new Date().toISOString();
        updateData.updated_by_user_id = req.user?.id || null;

        const { data, error } = await supabase
            .from('w_flows')
            .update(updateData)
            .eq('id', id)
            .eq('organization_id', orgId)
            .select()
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Flow not found' });
        invalidateFlowsCache(orgId);
        res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function validateFlow(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data: flow, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) throw error;
        if (!flow) return res.status(404).json({ error: 'Flow not found' });
        res.json(validateFlowDefinition(flow));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function publishFlow(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data: flow, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) throw error;
        if (!flow) return res.status(404).json({ error: 'Flow not found' });

        const validation = validateFlowDefinition(flow);
        if (!validation.valid) return res.status(400).json({ error: 'Flow validation failed', validation });

        const { data: latestVersion } = await supabase
            .from('w_flow_versions')
            .select('version_number')
            .eq('flow_id', flow.id)
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        const versionNumber = Number(latestVersion?.version_number || 0) + 1;
        const triggerKeywords = getFlowTriggerKeywords(flow, flow.nodes || []);
        const conflicts = await findFlowTriggerConflicts(orgId, flow, triggerKeywords);
        if (conflicts.length > 0) {
            const validation = {
                valid: false,
                errors: conflicts.map((item: any) =>
                    `Trigger "${item.triggers.join(', ')}" is already used by active flow "${item.flow.name}" on an overlapping WhatsApp account.`
                ),
            };
            return res.status(400).json({ error: 'Flow trigger conflict', validation });
        }

        const { data: version, error: versionErr } = await insertFlowVersionWithSchemaFallback({
            organization_id: orgId,
            flow_id: flow.id,
            version_number: versionNumber,
            nodes: flow.nodes || [],
            edges: flow.edges || [],
            trigger_type: flow.trigger_type || 'keyword',
            trigger_keywords: triggerKeywords,
            wa_account_scope: normalizeFlowAccountScope(flow.wa_account_scope),
            wa_account_ids: normalizeFlowAccountIds(flow.wa_account_ids),
            status: 'published',
            validation_errors: [],
            published_by_user_id: req.user?.id || null,
        });
        if (versionErr) throw versionErr;

        const { data: updated, error: updateErr } = await supabase
            .from('w_flows')
            .update({
                status: 'active',
                current_version_id: version.id,
                trigger_keywords: triggerKeywords,
                triggers: triggerKeywords,
                updated_at: new Date().toISOString(),
                updated_by_user_id: req.user?.id || null,
            })
            .eq('id', flow.id)
            .eq('organization_id', orgId)
            .select()
            .single();
        if (updateErr) throw updateErr;
        invalidateFlowsCache(orgId);
        res.json({ success: true, flow: updated, version });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getFlowRuns(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_flow_runs')
            .select('*')
            .eq('organization_id', orgId)
            .eq('flow_id', req.params.id)
            .order('started_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        res.json(data || []);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getFlowRunById(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data: run, error } = await supabase
            .from('w_flow_runs')
            .select('*')
            .eq('organization_id', orgId)
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!run) return res.status(404).json({ error: 'Flow run not found' });
        const { data: steps, error: stepErr } = await supabase
            .from('w_flow_run_steps')
            .select('*')
            .eq('organization_id', orgId)
            .eq('run_id', run.id)
            .order('started_at', { ascending: true });
        if (stepErr) throw stepErr;
        res.json({ ...run, steps: steps || [] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function deleteFlow(req: any, res: Response) {
    try {
        const { error } = await supabase
            .from('w_flows')
            .update({ status: 'archived', archived_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .eq('organization_id', req.organization_id);
        if (error) throw error;
        invalidateFlowsCache(req.organization_id);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getFlowSessionByContact(req: any, res: Response) {
    try {
        const { contact_id } = req.params;
        const { data, error } = await supabase
            .from('w_flow_sessions')
            .select(`*, w_flows ( name )`)
            .eq('contact_id', contact_id)
            .eq('status', 'active')
            .maybeSingle();
        if (error) throw error;
        res.json(data || null);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
}

export async function deleteFlowSession(req: any, res: Response) {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('w_flow_sessions').update({ status: 'abandoned' }).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
}
export async function testFlow(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;
    const { text, currentNodeId, flowState = {} } = req.body;
    
    try {
        const { data: flow, error } = await supabase
            .from('w_flows')
            .select('*')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
            
        if (error) throw error;
        if (!flow) return res.status(404).json({ error: 'Flow not found' });
        
        const nodes = flow.nodes || [];
        const edges = flow.edges || [];
        
        let activeNode;
        if (!currentNodeId) {
            // Start of flow: find trigger node
            activeNode = nodes.find(n => n.type === 'startBotFlow');
            if (!activeNode) return res.json({ output: "Error: No starting node (Keyword Trigger) found." });
            
            // Validate keyword match if it's a real start, but since it's a test, we can just proceed.
            // Move to next node immediately
            const outEdges = edges.filter(e => e.source === activeNode.id);
            if (outEdges.length > 0) {
                activeNode = nodes.find(n => n.id === outEdges[0].target);
            } else {
                return res.json({ output: "Flow ends immediately after start." });
            }
        } else {
            // Process user input for the current waiting node
            activeNode = nodes.find(n => n.id === currentNodeId);
            if (!activeNode) return res.json({ output: "Error: Current node not found." });
            
            const nodeType = activeNode.type;
            const config = activeNode.data?.config || {};
            let conditionMet = false;
            let matchEdge = null;
            const outEdges = edges.filter(e => e.source === activeNode.id);
            
            if (nodeType === 'userInput') {
                const saveToField = config.saveToField;
                if (saveToField) {
                    flowState[saveToField] = text;
                }
                matchEdge = outEdges[0];
            } else if (nodeType === 'button' || nodeType === 'interactive') {
                const actualValue = String(text || "").toLowerCase().trim();
                let matchedValue = null;
                
                // Find matching branch
                const branches = outEdges.map(e => e.sourceHandle);
                for (const branch of branches) {
                    if (actualValue === String(branch).toLowerCase().trim()) {
                        matchedValue = branch;
                        break;
                    }
                }
                
                if (matchedValue) {
                    matchEdge = outEdges.find(e => e.sourceHandle === matchedValue);
                } else if (outEdges.length > 0) {
                    // Fallback to default
                    matchEdge = outEdges.find(e => !e.sourceHandle || e.sourceHandle === 'default') || outEdges[0];
                }
            } else if (nodeType === 'condition') {
                 // Condition evaluating logic
                 matchEdge = outEdges[0]; // Simplified for test
            } else {
                matchEdge = outEdges[0];
            }
            
            if (matchEdge) {
                activeNode = nodes.find(n => n.id === matchEdge.target);
            } else {
                activeNode = null;
            }
        }
        
        // Now execute until we hit a waiting node (userInput, button, interactive) or end
        let outputText = [];
        let mediaOutput = [];
        let interactiveOptions = [];
        let buttons = [];
        let steps = 0;
        
        while (activeNode && steps < 15) {
            steps++;
            const nodeType = activeNode.type;
            const config = activeNode.data?.config || {};
            
            if (nodeType === 'textMessage') {
                if (config.message || config.text) outputText.push(config.message || config.text);
            } else if (['image', 'video', 'audio', 'file'].includes(nodeType)) {
                mediaOutput.push({
                    type: nodeType,
                    url: config.url || config.mediaUrl,
                    caption: config.caption || ''
                });
            } else if (nodeType === 'goto') {
                if (config.targetNodeId) {
                    activeNode = nodes.find(n => n.id === config.targetNodeId);
                    continue;
                }
            } else if (nodeType === 'end') {
                if (config.message) outputText.push(config.message);
                activeNode = null;
                break;
            } else if (nodeType === 'handoff') {
                outputText.push(`[System: Handoff to human - Reason: ${config.reason || 'None'}]`);
                activeNode = null;
                break;
            } else if (nodeType === 'userInput') {
                if (config.question || config.text) outputText.push(config.question || config.text);
                break; // Stop and wait for input
            } else if (nodeType === 'button') {
                const header = config.headerText || config.text || "Choose an option:";
                // Generate button texts from edges
                const btnEdges = edges.filter(e => e.source === activeNode.id);
                buttons = btnEdges.map(e => e.sourceHandle).filter(Boolean);
                outputText.push(`${header}`);
                break; // Stop and wait for input
            } else if (nodeType === 'interactive') {
                const header = config.headerText || config.text || "Choose an option:";
                const optsList = config.items || config.options || [];
                interactiveOptions = optsList.map(o => ({ id: o.id || o.title, title: o.title || o.id, description: o.description }));
                outputText.push(`${header}`);
                break; // Stop and wait for input
            } else if (nodeType === 'ai') {
                outputText.push(`[AI Agent Reply simulated]`);
            } else if (nodeType === 'condition') {
                const outEdges = edges.filter(e => e.source === activeNode.id);
                // For test, just take the first path always if condition logic is complex
                const matchEdge = outEdges[0];
                if (matchEdge) {
                    activeNode = nodes.find(n => n.id === matchEdge.target);
                    continue;
                } else {
                    break;
                }
            } else if (nodeType === 'abTest') {
                const outEdges = edges.filter(e => e.source === activeNode.id);
                const chosenPath = Math.random() < 0.5 ? 'pathA' : 'pathB';
                const matchEdge = outEdges.find(e => e.sourceHandle === chosenPath) || outEdges[0];
                outputText.push(`[A/B Test Simulation: Routed to ${chosenPath === 'pathA' ? 'Path A' : 'Path B'}]`);
                if (matchEdge) {
                    activeNode = nodes.find(n => n.id === matchEdge.target);
                    continue;
                } else {
                    break;
                }
            }
            
            // Advance to next node
            const nextEdge = edges.find(e => e.source === activeNode.id);
            if (nextEdge) {
                activeNode = nodes.find(n => n.id === nextEdge.target);
            } else {
                activeNode = null;
            }
        }
        
        res.json({
            output: outputText.length > 0 ? outputText.join('\n\n') : null,
            media: mediaOutput,
            interactiveOptions,
            buttons,
            currentNodeId: activeNode ? activeNode.id : null,
            flowState: flowState
        });
        
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}
