import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInteractiveReply } from '../agentButtons.js';

test('booking choices preserve actionable IDs and enforce WhatsApp limits', () => {
  const result = parseInteractiveReply(JSON.stringify({ text: 'Confirm these details?', buttons: [
    { id: 'Confirm booking request', text: 'Confirm' },
    { id: 'Change booking details', text: 'Change Details' },
    { id: 'flow_keyword', text: 'A label exceeding twenty characters' },
    { id: 'extra', text: 'Extra' },
  ] }));
  assert.equal(result?.buttons.length, 3);
  assert.equal(result?.buttons[0].id, 'Confirm booking request');
  assert.equal(result?.buttons[2].text.length, 20);
});

test('malformed, duplicate and empty buttons are not sent as interactive messages', () => {
  for (const text of ['Hello', '{broken}', JSON.stringify({ text: 'Body', buttons: [] }),
    JSON.stringify({ text: 'Body', buttons: [{ id: 'same', text: 'Yes' }, { id: 'same', text: 'No' }] }),
    JSON.stringify({ text: 'Body', buttons: [{ text: ' ' }] })]) {
    assert.equal(parseInteractiveReply(text), null);
  }
});

test('wrapped JSON is decoded and URL actions retain their target', () => {
  const result = parseInteractiveReply('```json\n' + JSON.stringify({ text: 'Register', buttons: [{ id: 'registration', text: 'Open', type: 'url', url: 'https://example.com/register' }] }) + '\n```');
  assert.equal(result?.buttons[0].url, 'https://example.com/register');
});

import { formatAgentLinks, resolveLinkAction } from '../agentButtons.js';
test('Markdown registration URLs with parentheses become exact URL buttons', () => {
  const url = 'https://www.cofee.life/register/events/(workshop)-dance/evnt_123';
  const reply = JSON.parse(formatAgentLinks(`Register here: [Workshop Payment Link](${url}).`));
  assert.equal(reply.buttons[0].url, url);
  assert.equal(reply.buttons[0].type, 'url');
  assert.ok(!reply.text.includes('https://'));
});
test('contact menus retain trusted followup actions', () => {
  const menu = formatAgentLinks('Contact +91 9860949200 or kriyastudio1224@gmail.com');
  const decoded = JSON.parse(menu);
  assert.equal(decoded.buttons.length, 2);
  assert.ok(!decoded.text.includes('9860949200'));
  assert.ok(!decoded.text.includes('kriyastudio1224@gmail.com'));
  const action = decoded.buttons.find((b: any) => b.text === 'Email via Gmail');
  const resolved = JSON.parse(resolveLinkAction(action.id, [{ role: 'assistant', content: menu }])!);
  assert.match(resolved.buttons[0].url, /^https:\/\/mail.google.com/);
  assert.equal(resolveLinkAction('agent_open:https://attacker.example', [{ role: 'assistant', content: menu }]), null);
});
test('ordinary text and booking buttons are preserved', () => {
  const reply = JSON.stringify({ text: 'Review request', buttons: [{ id: 'Confirm booking request', text: 'Confirm' }] });
  assert.equal(formatAgentLinks(reply), reply);
  assert.equal(formatAgentLinks('Hello!'), 'Hello!');
});

import { agentButtonsEnabled, presentAgentReply } from '../agentButtons.js';
test('stored false preference is respected while legacy agents keep buttons enabled', () => {
  assert.equal(agentButtonsEnabled({}), true);
  assert.equal(agentButtonsEnabled({ knowledge_base_content: [{ type: '__agent_settings', settings: { use_buttons: false } }] }), false);
  assert.equal(agentButtonsEnabled({ automation_settings: { use_buttons: false } }), false);
});
test('buttons OFF always exposes direct URLs even if the model generated button JSON', () => {
  const payload = JSON.stringify({ text: 'Register for the workshop.', buttons: [{ id: 'register', text: 'Register', type: 'url', url: 'https://example.com/workshop' }] });
  const reply = presentAgentReply(payload, false);
  assert.match(reply, /https:\/\/example.com\/workshop/);
  assert.equal(parseInteractiveReply(reply), null);
  assert.equal(parseInteractiveReply(presentAgentReply(payload, true))?.buttons[0].type, 'url');
});
test('buttons OFF restores email and contact actions and preserves fallback classification', () => {
  const payload = formatAgentLinks('Contact +91 9860949200 or kriyastudio1224@gmail.com');
  const plain = presentAgentReply(payload, false);
  assert.match(plain, /kriyastudio1224@gmail.com/);
  assert.match(plain, /https:\/\/wa.me\/919860949200/);
  assert.equal(parseInteractiveReply(plain), null);
  const fallback = presentAgentReply('[FALLBACK] ' + JSON.stringify({ text: 'Contact team', buttons: [{ id: 'human', text: 'Talk to Agent' }] }), false);
  assert.ok(fallback.startsWith('[FALLBACK]'));
  assert.equal(parseInteractiveReply(fallback), null);
});
