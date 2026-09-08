import { validateWhatsappTemplatePayload, type TemplateValidationIssue } from './whatsapp.js';

export const TEMPLATE_TYPES = ['DEFAULT', 'CATALOG', 'FLOW', 'AUTHENTICATION', 'CALL_PERMISSION_REQUEST'] as const;
export type TemplateType = typeof TEMPLATE_TYPES[number];

// These entries are still returned by Meta's template library, but their old
// component/button definitions cannot be cloned. Create them through Meta's
// current authentication template model instead.
export const LEGACY_AUTH_LIBRARY_TEMPLATE_NAMES = new Set([
  'delivery_code_1',
  'delivery_code_2',
  'delivery_code_3',
  'delivery_code_4',
  'delivery_code_5',
  'delivery_code_6',
  'login_code',
  'in_person_banking_user_verification',
  'temporary_password',
  'verify_account',
  'verify_account_2',
  'verify_password_recovery',
  'verify_code',
  'verify_otp_usecase',
  'verify_code_1',
  'verify_transaction_1',
  'verify_transaction_2',
  'verify_transaction_3',
  'verify_transaction_4',
  'verify_transfer_1',
]);

export function isLegacyAuthLibraryTemplate(name: unknown) {
  return LEGACY_AUTH_LIBRARY_TEMPLATE_NAMES.has(String(name || '').trim().toLowerCase());
}

export const UNAVAILABLE_BOUNDARY_LIBRARY_TEMPLATE_NAMES = new Set([
  'crisis_response_1',
  'crisis_response_2',
  'card_transaction_alert_1',
  'card_transaction_alert_2',
  'delivery_confirmation_3',
  'delivery_confirmation_4',
  'delivery_update_2',
  'disbursement_voucher_1',
  'health_awareness_1',
  'health_emergency_2',
  'identity_compliance_1',
  'order_canceled_1',
  'order_canceled_2',
  'payment_notice_2',
  'payment_notice_3',
  'purchase_transaction_alert',
  'severe_weather_alert_2',
]);

export function isUnavailableBoundaryLibraryTemplate(name: unknown) {
  return UNAVAILABLE_BOUNDARY_LIBRARY_TEMPLATE_NAMES.has(String(name || '').trim().toLowerCase());
}

export const UNAVAILABLE_PAYMENT_LIBRARY_TEMPLATE_NAMES = new Set([
  'payment_overdue_5',
  'payment_overdue_6',
  'payment_overdue_7',
  'payment_reminder_5',
  'payment_reminder_6',
  'payment_reminder_7',
  'payment_reminder_8',
  'payment_recharge_reminder_01',
]);

export function isUnavailablePaymentLibraryTemplate(name: unknown) {
  return UNAVAILABLE_PAYMENT_LIBRARY_TEMPLATE_NAMES.has(String(name || '').trim().toLowerCase());
}

export const UNAVAILABLE_FOOTER_LIMIT_LIBRARY_TEMPLATE_NAMES = new Set([
  'shipment_confirmation_1',
]);

export function isUnavailableFooterLimitLibraryTemplate(name: unknown) {
  return UNAVAILABLE_FOOTER_LIMIT_LIBRARY_TEMPLATE_NAMES.has(String(name || '').trim().toLowerCase());
}

export const UNAVAILABLE_DEPRECATED_LIBRARY_TEMPLATE_NAMES = new Set([
  'back_on_whatsapp',
]);

export function isUnavailableDeprecatedLibraryTemplate(name: unknown) {
  return UNAVAILABLE_DEPRECATED_LIBRARY_TEMPLATE_NAMES.has(String(name || '').trim().toLowerCase());
}

export function getLibraryTemplateUnavailabilityInfo(name: unknown) {
  const clean = String(name || '').trim().toLowerCase();

  if (UNAVAILABLE_BOUNDARY_LIBRARY_TEMPLATE_NAMES.has(clean)) {
    return {
      unavailable: true,
      code: 'META_LIBRARY_TEMPLATE_UNAVAILABLE',
      reason: 'Meta rejects this legacy template because its message starts or ends with a variable.',
      badge: 'Boundary variable issue',
      meta_error_code: 2388299,
    };
  }

  if (UNAVAILABLE_PAYMENT_LIBRARY_TEMPLATE_NAMES.has(clean)) {
    return {
      unavailable: true,
      code: 'WHATSAPP_PAYMENTS_REQUIRED',
      reason: 'Requires WhatsApp Payments setup and an eligible payment provider.',
      badge: 'Payments setup required',
      meta_error_code: null,
    };
  }

  if (UNAVAILABLE_FOOTER_LIMIT_LIBRARY_TEMPLATE_NAMES.has(clean)) {
    return {
      unavailable: true,
      code: 'FOOTER_LIMIT_EXCEEDED',
      reason: "Meta's library definition exceeds the 60-character limit for footers.",
      badge: 'Footer limit exceeded',
      meta_error_code: null,
    };
  }

  if (UNAVAILABLE_DEPRECATED_LIBRARY_TEMPLATE_NAMES.has(clean)) {
    return {
      unavailable: true,
      code: 'DEACTIVATED_BY_META',
      reason: 'This template has been deprecated or deactivated by Meta.',
      badge: 'Deactivated by Meta',
      meta_error_code: null,
    };
  }

  return null;
}

type BuildInput = {
  name: string;
  category: string;
  language: string;
  templateType?: string;
  components?: any[];
  typeConfig?: Record<string, any>;
};

const error = (code: string, field: string, message: string): TemplateValidationIssue => ({
  code,
  field,
  message,
  severity: 'error',
});

export function buildMetaTemplatePayload(input: BuildInput) {
  const templateType = String(input.templateType || 'DEFAULT').toUpperCase() as TemplateType;
  const components = Array.isArray(input.components) ? input.components : [];
  const config = input.typeConfig || {};
  const issues: TemplateValidationIssue[] = [];

  if (!TEMPLATE_TYPES.includes(templateType)) {
    issues.push(error('INVALID_TEMPLATE_TYPE', 'template_type', 'Unsupported template type.'));
  }

  let metaComponents = components;

  if (templateType === 'AUTHENTICATION') {
    if (input.category !== 'AUTHENTICATION') {
      issues.push(error('AUTH_CATEGORY_REQUIRED', 'category', 'OTP templates must use Authentication.'));
    }
    const otpType = String(config.otp_type || 'COPY_CODE').toUpperCase();
    if (!['COPY_CODE', 'ONE_TAP', 'ZERO_TAP'].includes(otpType)) {
      issues.push(error('INVALID_OTP_TYPE', 'otp_type', 'Choose Copy Code, One-tap, or Zero-tap.'));
    }
    if (['ONE_TAP', 'ZERO_TAP'].includes(otpType) && (!config.package_name || !config.signature_hash)) {
      issues.push(error('ANDROID_APP_REQUIRED', 'package_name', 'Android package name and signature hash are required for autofill.'));
    }
    const expiry = Number(config.code_expiration_minutes || 10);
    if (!Number.isInteger(expiry) || expiry < 1 || expiry > 90) {
      issues.push(error('INVALID_CODE_EXPIRY', 'code_expiration_minutes', 'Code expiry must be between 1 and 90 minutes.'));
    }
    const button: Record<string, any> = {
      type: 'OTP',
      otp_type: otpType,
      text: String(config.copy_code_text || 'Copy Code').trim(),
    };
    if (otpType !== 'COPY_CODE') {
      button.autofill_text = String(config.autofill_text || 'Autofill').trim();
      button.package_name = String(config.package_name || '').trim();
      button.signature_hash = String(config.signature_hash || '').trim();
    }
    if (otpType === 'ZERO_TAP') button.zero_tap_terms_accepted = Boolean(config.zero_tap_terms_accepted);
    metaComponents = [
      { type: 'BODY', add_security_recommendation: config.add_security_recommendation !== false },
      { type: 'FOOTER', code_expiration_minutes: expiry },
      { type: 'BUTTONS', buttons: [button] },
    ];
  }

  if (templateType === 'CATALOG') {
    if (input.category !== 'MARKETING') issues.push(error('CATALOG_CATEGORY_REQUIRED', 'category', 'Catalog templates must use Marketing.'));
    if (!String(config.catalog_id || '').trim()) issues.push(error('CATALOG_REQUIRED', 'catalog_id', 'Select a connected Meta catalog.'));
    metaComponents = [
      ...components.filter(component => component?.type !== 'BUTTONS'),
      { type: 'BUTTONS', buttons: [{ type: 'CATALOG', text: String(config.button_text || 'View catalog').trim() }] },
    ];
  }

  if (templateType === 'FLOW') {
    if (!String(config.flow_id || '').trim()) issues.push(error('FLOW_REQUIRED', 'flow_id', 'Select a published Meta Flow.'));
    if (!String(config.navigate_screen || '').trim()) issues.push(error('FLOW_SCREEN_REQUIRED', 'navigate_screen', 'Select a destination screen.'));
    metaComponents = [
      ...components.filter(component => component?.type !== 'BUTTONS'),
      {
        type: 'BUTTONS',
        buttons: [{
          type: 'FLOW',
          text: String(config.button_text || 'Open form').trim(),
          flow_id: String(config.flow_id || '').trim(),
          navigate_screen: String(config.navigate_screen || '').trim(),
          flow_action: 'navigate',
        }],
      },
    ];
  }

  if (templateType === 'CALL_PERMISSION_REQUEST') {
    if (!['MARKETING', 'UTILITY'].includes(input.category)) {
      issues.push(error('CALL_CATEGORY_REQUIRED', 'category', 'Calling permission templates must use Marketing or Utility.'));
    }
    if (!config.calling_enabled) issues.push(error('CALLING_NOT_ENABLED', 'template_type', 'WhatsApp Calling is not enabled for this number.'));
    if (components.some(component => component?.type === 'HEADER' && component?.format !== 'TEXT')) {
      issues.push(error('CALL_HEADER_TEXT_ONLY', 'header', 'Calling permission templates support text headers only.'));
    }
    metaComponents = [
      ...components.filter(component => component?.type !== 'BUTTONS'),
      { type: 'CALL_PERMISSION_REQUEST' },
    ];
  }

  const payload = {
    name: String(input.name || '').trim().toLowerCase(),
    category: String(input.category || '').trim().toUpperCase(),
    language: String(input.language || '').trim(),
    components: metaComponents,
  };

  if (templateType === 'AUTHENTICATION') {
    if (!/^[a-z0-9_]{1,512}$/.test(payload.name)) issues.push(error('INVALID_NAME', 'name', 'Template name must use lowercase letters, numbers, and underscores only.'));
    if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(payload.language)) issues.push(error('INVALID_LANGUAGE', 'language', 'Choose a supported Meta language.'));
  } else {
    issues.push(...validateWhatsappTemplatePayload(payload).issues);
  }

  return { templateType, payload, issues, canSubmit: !issues.some(issue => issue.severity === 'error') };
}
