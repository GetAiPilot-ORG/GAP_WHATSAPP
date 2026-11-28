export type QuickReplyFlow = {
  id: string; name: string; status: string;
  saved_keywords: string[]; live_keywords: string[];
  saved_match_type: string; live_match_type: string;
  wa_account_scope: string; wa_account_ids: string[];
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const matches = (keyword: string, keywords: string[], type: string) => keywords.some(value => {
  const trigger = normalize(value);
  return trigger && (type === 'exact' ? normalize(keyword) === trigger : normalize(keyword).includes(trigger));
});

export function quickReplyRoutes(keyword: string, accountId: string | null, flows: QuickReplyFlow[]) {
  return flows.flatMap(flow => {
    if (flow.status === 'archived') return [];
    if (flow.wa_account_scope === 'selected' && (!accountId || !flow.wa_account_ids.includes(accountId))) return [];
    const saved = matches(keyword, flow.saved_keywords, flow.saved_match_type);
    const live = flow.status === 'active' && matches(keyword, flow.live_keywords, flow.live_match_type);
    return saved || live ? [{ flow_id: flow.id, flow_name: flow.name, flow_status: flow.status, saved, live }] : [];
  });
}

// A derived registry stays fresh when a template/flow is renamed, deleted or republished.
export function buildQuickReplyRegistry(templates: any[], flows: QuickReplyFlow[]) {
  const entries = new Map<string, any>();
  for (const template of templates) {
    if (['DELETED', 'ARCHIVED'].includes(String(template.status).toUpperCase())) continue;
    const components = Array.isArray(template.components) && template.components.length ? template.components : template.normalized_payload?.components;
    for (const component of Array.isArray(components) ? components : []) {
      if (String(component?.type).toUpperCase() !== 'BUTTONS') continue;
      for (const [index, button] of (Array.isArray(component.buttons) ? component.buttons : []).entries()) {
        if (String(button?.type).toUpperCase() !== 'QUICK_REPLY') continue;
        // Template quick-reply labels are the default incoming trigger. Custom send-time
        // payloads are separate and must not be mistaken for a template definition.
        const keyword = String(button.text || '').trim();
        if (!keyword) continue;
        const accountId = template.wa_account_id || null;
        const id = JSON.stringify([accountId, normalize(keyword)]);
        const entry = entries.get(id) || { id, keyword, wa_account_id: accountId, sources: [] };
        entry.sources.push({ template_id: template.id, template_name: template.name, language: template.language, template_status: template.status, button_index: index });
        entries.set(id, entry);
      }
    }
  }
  return [...entries.values()].map(entry => {
    const routes = quickReplyRoutes(entry.keyword, entry.wa_account_id, flows);
    const live = routes.filter(route => route.live);
    return { ...entry, routes, status: live.length > 1 ? 'conflict' : live.length ? 'ready' : routes.length ? 'not_live' : 'unassigned' };
  }).sort((a, b) => a.keyword.localeCompare(b.keyword));
}
