import { validateWhatsappTemplatePayload, type TemplateValidationIssue } from './whatsapp.js';

export const TEMPLATE_TYPES = ['DEFAULT', 'CATALOG', 'FLOW', 'AUTHENTICATION', 'CALL_PERMISSION_REQUEST'] as const;
export type TemplateType = typeof TEMPLATE_TYPES[number];

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
