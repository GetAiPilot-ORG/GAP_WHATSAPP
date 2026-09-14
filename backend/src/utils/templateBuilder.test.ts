import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetaTemplatePayload,
  isLegacyAuthLibraryTemplate,
  LEGACY_AUTH_LIBRARY_TEMPLATE_NAMES,
  isUnavailableBoundaryLibraryTemplate,
  UNAVAILABLE_BOUNDARY_LIBRARY_TEMPLATE_NAMES,
  isUnavailablePaymentLibraryTemplate,
  UNAVAILABLE_PAYMENT_LIBRARY_TEMPLATE_NAMES,
  isUnavailableFooterLimitLibraryTemplate,
  UNAVAILABLE_FOOTER_LIMIT_LIBRARY_TEMPLATE_NAMES,
  isUnavailableDeprecatedLibraryTemplate,
  UNAVAILABLE_DEPRECATED_LIBRARY_TEMPLATE_NAMES,
  getLibraryTemplateUnavailabilityInfo,
} from './templateBuilder.js';

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

test('routes all 20 legacy library authentication templates to the OTP model', () => {
  assert.equal(LEGACY_AUTH_LIBRARY_TEMPLATE_NAMES.size, 20);
  for (const name of LEGACY_AUTH_LIBRARY_TEMPLATE_NAMES) {
    assert.equal(isLegacyAuthLibraryTemplate(name), true);
    const result = buildMetaTemplatePayload({
      name,
      language: 'en_US',
      category: 'AUTHENTICATION',
      templateType: 'AUTHENTICATION',
      typeConfig: { otp_type: 'COPY_CODE', code_expiration_minutes: 10 },
    });
    assert.equal(result.canSubmit, true, `${name} should build a valid OTP payload`);
    assert.equal(result.payload.category, 'AUTHENTICATION');
    assert.equal(result.payload.components[2].buttons[0].type, 'OTP');
  }
  assert.equal(isLegacyAuthLibraryTemplate('order_confirmation_1'), false);
});

test('marks all 17 boundary-variable library templates unavailable', () => {
  assert.equal(UNAVAILABLE_BOUNDARY_LIBRARY_TEMPLATE_NAMES.size, 17);
  for (const name of UNAVAILABLE_BOUNDARY_LIBRARY_TEMPLATE_NAMES) {
    assert.equal(isUnavailableBoundaryLibraryTemplate(name), true);
    const info = getLibraryTemplateUnavailabilityInfo(name);
    assert.ok(info?.unavailable);
    assert.equal(info.code, 'META_LIBRARY_TEMPLATE_UNAVAILABLE');
    assert.equal(info.meta_error_code, 2388299);
  }
  assert.equal(isUnavailableBoundaryLibraryTemplate('appointment_confirmation_1'), false);
});

test('marks all 8 WhatsApp Payments library templates unavailable with WHATSAPP_PAYMENTS_REQUIRED', () => {
  assert.equal(UNAVAILABLE_PAYMENT_LIBRARY_TEMPLATE_NAMES.size, 8);
  for (const name of UNAVAILABLE_PAYMENT_LIBRARY_TEMPLATE_NAMES) {
    assert.equal(isUnavailablePaymentLibraryTemplate(name), true);
    const info = getLibraryTemplateUnavailabilityInfo(name);
    assert.ok(info?.unavailable);
    assert.equal(info.code, 'WHATSAPP_PAYMENTS_REQUIRED');
    assert.equal(info.badge, 'Payments setup required');
  }
});

test('marks footer limit and deprecated templates unavailable with appropriate codes', () => {
  assert.equal(UNAVAILABLE_FOOTER_LIMIT_LIBRARY_TEMPLATE_NAMES.size, 1);
  assert.equal(isUnavailableFooterLimitLibraryTemplate('shipment_confirmation_1'), true);
  const footerInfo = getLibraryTemplateUnavailabilityInfo('shipment_confirmation_1');
  assert.equal(footerInfo?.code, 'FOOTER_LIMIT_EXCEEDED');

  assert.equal(UNAVAILABLE_DEPRECATED_LIBRARY_TEMPLATE_NAMES.size, 1);
  assert.equal(isUnavailableDeprecatedLibraryTemplate('back_on_whatsapp'), true);
  const depInfo = getLibraryTemplateUnavailabilityInfo('back_on_whatsapp');
  assert.equal(depInfo?.code, 'DEACTIVATED_BY_META');

  assert.equal(getLibraryTemplateUnavailabilityInfo('account_creation_confirmation_3'), null);
});

test('blocks specialty templates without required capabilities or assets', () => {
  const catalog = buildMetaTemplatePayload({ ...base, category: 'MARKETING', templateType: 'CATALOG' });
  const calling = buildMetaTemplatePayload({ ...base, templateType: 'CALL_PERMISSION_REQUEST', typeConfig: { calling_enabled: false } });
  assert.ok(catalog.issues.some(issue => issue.code === 'CATALOG_REQUIRED'));
  assert.ok(calling.issues.some(issue => issue.code === 'CALLING_NOT_ENABLED'));
});
