import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { getFlowTriggerKeywords, normalizeFlowAccountScope, normalizeFlowAccountIds } from '../services/flows.service.js';
import { buildQuickReplyRegistry, QuickReplyFlow } from '../services/quickReplyRegistry.js';

async function readAll(table: string, orgId: string, columns: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).eq('organization_id', orgId).order('id').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function getQuickReplyRegistry(req: any, res: Response) {
  const orgId = req.organization_id;
  if (!orgId) return res.status(401).json({ error: 'Organization required' });
  try {
    const [templates, flows] = await Promise.all([
      readAll('w_template_submissions', orgId, 'id,name,language,status,wa_account_id,components,normalized_payload'),
      readAll('w_flows', orgId, '*'),
    ]);
    const versionIds = [...new Set(flows.filter(flow => flow.status === 'active' && flow.current_version_id).map(flow => flow.current_version_id))];
    const versions = new Map<string, any>();
    for (let offset = 0; offset < versionIds.length; offset += 100) {
      const { data, error } = await supabase.from('w_flow_versions').select('*').eq('organization_id', orgId).in('id', versionIds.slice(offset, offset + 100));
      if (error) throw error;
      for (const version of data || []) versions.set(version.id, version);
    }
    const routing: QuickReplyFlow[] = flows.filter(flow => flow.status !== 'archived').map(flow => {
      const live = versions.get(flow.current_version_id) || flow;
      const matchType = (value: any) => {
        const start = value.nodes?.find((node: any) => node.type === 'startBotFlow');
        return String(start?.data?.config?.matchType || start?.data?.matchType || start?.config?.matchType || value.match_type || 'string').toLowerCase().trim();
      };
      return { id: flow.id, name: flow.name, status: flow.status, saved_keywords: getFlowTriggerKeywords(flow), live_keywords: getFlowTriggerKeywords(live), saved_match_type: matchType(flow), live_match_type: matchType(live), wa_account_scope: normalizeFlowAccountScope(flow.wa_account_scope), wa_account_ids: normalizeFlowAccountIds(flow.wa_account_ids) };
    });
    return res.json({ quick_replies: buildQuickReplyRegistry(templates, routing), flows: routing });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Could not load quick reply routing' });
  }
}
