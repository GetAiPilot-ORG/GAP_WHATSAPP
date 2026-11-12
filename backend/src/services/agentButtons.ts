// Shared decoding for live agent delivery and the agent test chat.
export function parseInteractiveReply(text: string) {
  try {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    const value = JSON.parse(text.slice(first, last + 1));
    if (typeof value?.text !== 'string' || !value.text.trim() || !Array.isArray(value.buttons)) return null;
    const ids = new Set<string>();
    const buttons = value.buttons.slice(0, 3).map((button: any) => {
      if (typeof button?.text !== 'string') throw new Error('Invalid label');
      const label = button.text.trim().slice(0, 20);
      const id = String(button.id || label).trim().slice(0, 256);
      if (!label || !id || ids.has(id)) throw new Error('Invalid button ID');
      ids.add(id);
      const type = button.type || 'reply';
      if (!['reply', 'url', 'form', 'phone'].includes(type)) throw new Error('Invalid type');
      if (['url', 'form'].includes(type) && !/^https?:\/\//i.test(button.url || '')) throw new Error('Invalid URL');
      if (type === 'phone' && !button.phone) throw new Error('Missing phone');
      return { id, text: label, type, ...(button.url ? { url: button.url } : {}), ...(button.phone ? { phone: button.phone } : {}) };
    });
    if (!buttons.length || new Set(buttons.map((b: any) => b.type)).size > 1) return null;
    return { text: value.text.trim().slice(0, 1024), buttons, footer: typeof value.footer === 'string' ? value.footer.slice(0, 60) : '' };
  } catch {
    return null;
  }
}

const OPEN_ACTION = 'agent_open:';

// Route our own link-choice replies without asking the model to recreate a URL.
export function resolveLinkAction(text: string, history: Array<{ role: string; content: string }>): string | null {
  if (!text.startsWith(OPEN_ACTION)) return null;
  const previous = [...history].reverse().find(m => m.role === 'assistant' && m.content.includes(text));
  if (!previous) return null;
  const url = text.slice(OPEN_ACTION.length);
  try {
    const target = new URL(url);
    if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) return null;
  } catch { return null; }
  return JSON.stringify({ text: 'Neeche button se open karein.', buttons: [{ id: 'open_link', text: 'Open Link', type: 'url', url }] });
}

// Convert model-produced links/contact information into actual action buttons.
// Multiple actions use a reply menu, since a native URL CTA carries one URL.
export function formatAgentLinks(reply: string): string {
  if (reply.startsWith('[FALLBACK]')) return reply;
  const interactive = parseInteractiveReply(reply);
  let body: string = interactive?.text || reply;
  const actions: Array<{ label: string; url: string }> = [];
  const add = (label: string, url: string) => {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return;
      if (!actions.some(a => a.url === url)) actions.push({ label: label.slice(0, 20), url });
    } catch { /* Never manufacture an invalid action. */ }
  };
  for (const button of interactive?.buttons || []) {
    if (button.type === 'url' || button.type === 'form') add(button.text, button.url);
    if (button.type === 'phone') add('WhatsApp Studio', `https://wa.me/${String(button.phone).replace(/\D/g, '')}`);
  }
  // Match Markdown first, preserving balanced parentheses inside real URLs.
  body = body.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g, (_all, label, url) => {
    add(label, url);
    return label;
  });
  body = body.replace(/https?:\/\/[^\s<>]+/g, raw => {
    let url = raw.replace(/[.,;!?]+$/, '');
    while (url.endsWith(')') && (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length) url = url.slice(0, -1);
    const label = /maps\.|google.*maps/i.test(url) ? 'View Location' : /pay|payment/i.test(body) ? 'Open Payment Link' : /register|registration/i.test(url) ? 'Register' : 'Open Link';
    add(label, url);
    return '';
  });
  body = body.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, email => {
    add('Email via Gmail', `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`);
    return 'Email via Gmail';
  });
  body = body.replace(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g, phone => {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) digits = `91${digits}`;
    add('WhatsApp Studio', `https://wa.me/${digits}`);
    return 'WhatsApp contact';
  });
  if (!actions.length) return reply;
  const cleaned = body.replace(/\(\s*\)/g, '').replace(/\n{3,}/g, '\n\n').trim() || 'Neeche button se open karein.';
  if (actions.length === 1 && !interactive?.buttons.some((b: any) => b.type === 'reply')) {
    return JSON.stringify({ text: cleaned.slice(0, 1024), buttons: [{ id: 'open_link', text: actions[0].label, type: 'url', url: actions[0].url }] });
  }
  const buttons = [...(interactive?.buttons.filter((b: any) => b.type === 'reply') || [])];
  for (const action of actions) {
    if (OPEN_ACTION.length + action.url.length > 256 || buttons.length === 3) break;
    buttons.push({ id: `${OPEN_ACTION}${action.url}`, text: action.label, type: 'reply' });
  }
  // A long URL still gets an actionable CTA rather than a broken/truncated ID.
  if (!buttons.length) return JSON.stringify({ text: cleaned.slice(0, 1024), buttons: [{ id: 'open_link', text: actions[0].label, type: 'url', url: actions[0].url }] });
  return JSON.stringify({ text: cleaned.slice(0, 1024), buttons });
}


export function agentButtonsEnabled(agent: any): boolean {
  const metadata = (Array.isArray(agent?.knowledge_base_content) ? agent.knowledge_base_content : [])
    .find((item: any) => item?.type === '__agent_settings');
  return (metadata?.settings || agent?.automation_settings)?.use_buttons !== false;
}

// Enforce the stored preference even if an older system prompt generates JSON.
export function presentAgentReply(reply: string, useButtons: boolean): string {
  if (useButtons) return formatAgentLinks(reply);
  const fallback = reply.startsWith('[FALLBACK]');
  const content = fallback ? reply.slice('[FALLBACK]'.length).trim() : reply;
  const parsed = parseInteractiveReply(content);
  if (!parsed) return reply;
  const actions = parsed.buttons.map((button: any) => {
    const target = button.url || (button.id.startsWith(OPEN_ACTION) ? button.id.slice(OPEN_ACTION.length) : null);
    if (target) {
      try {
        const url = new URL(target);
        if (url.hostname === 'mail.google.com' && url.searchParams.has('to')) return `Email: ${url.searchParams.get('to')}`;
      } catch { /* Keep the original link. */ }
      return `${button.text}: ${target}`;
    }
    if (button.phone) return `${button.text}: ${button.phone}`;
    return button.text;
  });
  return `${fallback ? '[FALLBACK] ' : ''}${parsed.text}\n\n${actions.join('\n')}`;
}
