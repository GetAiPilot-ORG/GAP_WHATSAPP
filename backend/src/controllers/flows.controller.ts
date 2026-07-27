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
        if (updateData.nodes !== undefined || req.body.triggers !== undefined || req.body.trigger_keywords !== undefined) {
            const nodes = updateData.nodes !== undefined ? updateData.nodes : req.body.nodes;
            const triggerKeywords = getFlowTriggerKeywords({ ...req.body, nodes }, nodes);
            updateData.trigger_keywords = triggerKeywords;
            updateData.triggers = triggerKeywords;
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
