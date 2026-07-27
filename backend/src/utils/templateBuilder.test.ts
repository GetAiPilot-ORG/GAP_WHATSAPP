import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMetaTemplatePayload } from './templateBuilder.js';

const base = {
  name: 'order_update',
  language: 'en_US',
  category: 'UTILITY',
  components: [{ type: 'BODY', text: 'Your order 10834 is confirmed.' }],
};

test('builds a published Flow button from server-owned fields', () => {
  const result = buildMetaTemplatePayload({
    ...base,
    templateType: 'FLOW',
    typeConfig: { flow_id: '123', navigate_screen: 'WELCOME', button_text: 'Open form' },
  });
  assert.equal(result.canSubmit, true);
  assert.deepEqual(result.payload.components.at(-1), {
    type: 'BUTTONS',
    buttons: [{ type: 'FLOW', text: 'Open form', flow_id: '123', navigate_screen: 'WELCOME', flow_action: 'navigate' }],
  });
});

test('builds Meta-controlled authentication components', () => {
  const result = buildMetaTemplatePayload({
    name: 'login_code',
    language: 'hi',
    category: 'AUTHENTICATION',
    templateType: 'AUTHENTICATION',
    typeConfig: { otp_type: 'COPY_CODE', code_expiration_minutes: 10 },
  });
  assert.equal(result.canSubmit, true);
  assert.equal(result.payload.components[2].buttons[0].otp_type, 'COPY_CODE');
});

test('blocks specialty templates without required capabilities or assets', () => {
  const catalog = buildMetaTemplatePayload({ ...base, category: 'MARKETING', templateType: 'CATALOG' });
  const calling = buildMetaTemplatePayload({ ...base, templateType: 'CALL_PERMISSION_REQUEST', typeConfig: { calling_enabled: false } });
  assert.ok(catalog.issues.some(issue => issue.code === 'CATALOG_REQUIRED'));
  assert.ok(calling.issues.some(issue => issue.code === 'CALLING_NOT_ENABLED'));
});
