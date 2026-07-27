import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, FileText, Image, Loader2, Plus, Search, ShieldCheck, Trash2, Type, UploadCloud, Video, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { META_LANGUAGES, getMetaLanguage } from '../data/metaLanguages';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-500';
const initialForm = {
  category: 'MARKETING', templateType: 'DEFAULT', language: 'en_US', name: '',
  headerType: 'NONE', headerText: '', headerSample: '', bodyText: '', footerText: '', bodySamples: {},
  buttons: [], catalogId: '', flowId: '', flowScreen: '', flowButtonText: 'Open form',
  otpType: 'COPY_CODE', securityRecommendation: true, expiryMinutes: 10,
  packageName: '', signatureHash: '', zeroTapAccepted: false,
};

const TYPE_OPTIONS = {
  MARKETING: [
    ['DEFAULT', 'Default', 'Media, message content and customer actions'],
    ['CATALOG', 'Catalog', 'Let customers browse your connected product catalog'],
    ['FLOW', 'WhatsApp Flow', 'Open a published Meta form or journey'],
    ['CALL_PERMISSION_REQUEST', 'Calling permission', 'Ask for consent before a WhatsApp call'],
  ],
  UTILITY: [
    ['DEFAULT', 'Default', 'Order, account, appointment or transaction updates'],
    ['FLOW', 'WhatsApp Flow', 'Collect feedback or manage a customer request'],
    ['CALL_PERMISSION_REQUEST', 'Calling permission', 'Ask for consent about an active service request'],
  ],
  AUTHENTICATION: [['AUTHENTICATION', 'One-time passcode', 'Send a Meta-formatted verification code']],
};

const getVariables = text => [...new Set([...String(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(match => Number(match[1])))].sort((a, b) => a - b);

function LanguageCombobox({ value, onChange, dropUp = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = getMetaLanguage(value);
  const languages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = META_LANGUAGES.filter(language => !normalized || `${language.label} ${language.nativeName} ${language.code}`.toLowerCase().includes(normalized));
    return [...matches].sort((a, b) => ['en_US', 'hi'].indexOf(b.code) - ['en_US', 'hi'].indexOf(a.code) || a.label.localeCompare(b.label));
  }, [query]);

  return (
    <div className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className={`${fieldClass} flex items-center justify-between text-left`}>
        <span><span className="font-medium">{selected.nativeName}</span> <span className="text-slate-500">— {selected.code}</span></span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className={`absolute z-[60] w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${dropUp ? 'bottom-full mb-1' : 'mt-1'}`}>
          <label className="flex items-center gap-2 border-b border-slate-200 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <span className="sr-only">Search languages</span>
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Escape' && setOpen(false)} className="h-11 min-w-0 flex-1 border-0 text-sm outline-none" placeholder="Search language or locale code" />
          </label>
          <ul role="listbox" className="max-h-52 overflow-y-auto p-1">
            {languages.map(language => (
              <li key={language.code} role="option" aria-selected={language.code === value}>
                <button type="button" onClick={() => { onChange(language.code); setOpen(false); setQuery(''); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <span><span className="font-medium">{language.nativeName}</span><span className="ml-2 text-xs text-slate-500">{language.label} · {language.code}</span></span>
                  {language.code === value && <Check className="h-4 w-4 text-blue-600" />}
                </button>
              </li>
            ))}
            {!languages.length && <li className="px-3 py-6 text-center text-sm text-slate-500">No supported Meta language found.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function WhatsAppPreview({ form, mediaUrl }) {
  const language = getMetaLanguage(form.language);
  const isAuth = form.templateType === 'AUTHENTICATION';
  const body = isAuth ? '123456 is your verification code. For your security, do not share this code.' : (form.bodyText || 'Your message will appear here…');
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-slate-900">Live preview</p>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-1.5 pr-2.5 text-[10px] font-semibold text-emerald-700">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
          WhatsApp
        </span>
      </div>

      <div className="relative mx-auto mb-2 h-[560px] w-[270px] shrink-0 rounded-[40px] border-[8px] border-black bg-black shadow-[0_15px_40px_-10px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.05),inset_0_0_0_1px_rgba(255,255,255,0.15)]">
        <div className="absolute left-1/2 top-2 z-50 flex h-[22px] w-[84px] -translate-x-1/2 items-center justify-between rounded-full bg-black px-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
          <div className="h-2 w-2 rounded-full bg-[#111] shadow-[inset_0_0_1px_1px_rgba(255,255,255,0.05)]"></div>
          <div className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#0a0a20] shadow-[inset_0_0_2px_1px_rgba(255,255,255,0.1)]">
            <div className="h-1 w-1 rounded-full bg-blue-500/30 blur-[1px]"></div>
          </div>
        </div>

        <div className="absolute -left-[10px] top-[80px] h-6 w-0.5 rounded-l-sm bg-slate-800"></div>
        <div className="absolute -left-[10px] top-[115px] h-11 w-0.5 rounded-l-sm bg-slate-800"></div>
        <div className="absolute -left-[10px] top-[165px] h-11 w-0.5 rounded-l-sm bg-slate-800"></div>
        
        <div className="absolute -right-[10px] top-[135px] h-14 w-0.5 rounded-r-sm bg-slate-800"></div>

        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[32px] bg-[#efeae2]">
          
          <div className="absolute left-0 right-0 top-0 z-40 flex h-10 items-center justify-between px-4 pt-1 text-[10px] font-semibold text-slate-900 bg-white/70 backdrop-blur-md">
            <span className="mt-1">9:41</span>
            <div className="mt-1 flex items-center gap-1.5">
              <svg className="h-2 w-3" viewBox="0 0 16 11" fill="none"><path d="M1 10.5H3V5.5H1V10.5ZM5 10.5H7V3.5H5V10.5ZM9 10.5H11V1.5H9V10.5ZM13 10.5H15V0H13V10.5Z" fill="currentColor"/></svg>
              <svg className="h-2.5 w-3.5" viewBox="0 0 16 12" fill="none"><path d="M8 0.5C4.85 0.5 2 1.7 0 3.65L8 11.5L16 3.65C14 1.7 11.15 0.5 8 0.5Z" fill="currentColor"/></svg>
              <div className="h-2 w-[18px] rounded-sm border border-current p-[1px]"><div className="h-full w-full rounded-[1px] bg-current"></div></div>
            </div>
          </div>

          <div className="relative z-30 flex h-[76px] shrink-0 flex-col justify-end bg-white/95 px-3 pb-2.5 pt-11 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">B</span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-slate-900 leading-tight">Business name</span>
                <span className="block text-[9px] text-slate-500 leading-tight">Official business account</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2.5 pb-5 pt-2.5 scrollbar-thin scrollbar-thumb-slate-300">
            <div className="mb-3 text-center"><span className="inline-block rounded-lg bg-white/80 px-2 py-1 text-[8.5px] font-medium text-slate-500 shadow-sm backdrop-blur-sm">TODAY</span></div>
            
            <div className="mb-2 w-full overflow-hidden rounded-[14px] rounded-tl-sm bg-white shadow-sm" dir={language.rtl ? 'rtl' : 'ltr'}>
              {form.headerType === 'TEXT' && form.headerText && <p className="px-2.5 pt-2.5 text-[12px] font-semibold text-slate-900">{form.headerText}</p>}
              {form.headerType === 'IMAGE' && (mediaUrl ? <img src={mediaUrl} alt="Header preview" className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center bg-slate-100 text-slate-400"><Image className="h-5 w-5" /></div>)}
              {form.headerType === 'VIDEO' && (mediaUrl ? <video src={mediaUrl} className="h-28 w-full bg-black object-cover" muted controls /> : <div className="flex h-28 items-center justify-center bg-slate-100 text-slate-400"><Video className="h-5 w-5" /></div>)}
              {form.headerType === 'DOCUMENT' && <div className="flex h-16 flex-col items-center justify-center gap-1.5 bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /><span className="max-w-[180px] truncate text-[9px]">{mediaUrl ? 'Document selected' : 'Document preview'}</span></div>}
              
              <p className="whitespace-pre-wrap break-words px-2.5 pt-2 text-[11.5px] leading-[1.4] text-slate-800">{body}</p>
              {form.footerText && <p className="px-2.5 pt-1 text-[9.5px] text-slate-500">{form.footerText}</p>}
              <p className="px-2.5 pb-1.5 text-right text-[8.5px] text-slate-400 mt-0.5">10:00 AM <span className="text-sky-500">✓✓</span></p>
              
              {(isAuth || form.templateType === 'CATALOG' || form.templateType === 'FLOW' || form.templateType === 'CALL_PERMISSION_REQUEST' || form.buttons.length > 0) && (
                <div className="border-t border-slate-100 text-center text-[11px] font-semibold text-sky-600">
                  {isAuth ? <div className="py-2 active:bg-slate-50 transition-colors">{form.otpType === 'COPY_CODE' ? 'Copy code' : 'Autofill'}</div>
                    : form.templateType === 'CATALOG' ? <div className="py-2 active:bg-slate-50 transition-colors">View catalog</div>
                      : form.templateType === 'FLOW' ? <div className="py-2 active:bg-slate-50 transition-colors">{form.flowButtonText}</div>
                        : form.templateType === 'CALL_PERMISSION_REQUEST' ? <div className="py-2 active:bg-slate-50 transition-colors">Allow calls</div>
                          : form.buttons.map((button, index) => <div key={index} className="border-b border-slate-100 py-2 last:border-0 active:bg-slate-50 transition-colors">{button.text || 'Button text'}</div>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplateWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { apiCall, memberProfile } = useAuth();
  const { confirmDialog } = useDialog();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [restored, setRestored] = useState(false);

  const { data: context, isLoading, error } = useQuery({
    queryKey: ['template-context'],
    queryFn: async () => {
      const response = await apiCall(`${API_URL}/api/whatsapp/template-context`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not load Meta template capabilities.');
      return json;
    },
  });
  const draftKey = context?.account?.waba_id ? `wa-template-draft:${memberProfile?.organization_id || 'org'}:${context.account.waba_id}` : '';
  const variables = useMemo(() => getVariables(form.bodyText), [form.bodyText]);
  const mediaUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  const selectedFlow = context?.flows?.find(flow => flow.id === form.flowId);
  const flowScreens = selectedFlow?.screens || selectedFlow?.preview?.screens || [];

  useEffect(() => {
    if (!draftKey) return;
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try { setForm({ ...initialForm, ...JSON.parse(draft) }); setRestored(true); } catch { localStorage.removeItem(draftKey); }
    }
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    const timer = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(form)), 400);
    return () => clearTimeout(timer);
  }, [draftKey, form]);
  useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }, [mediaUrl]);
  useEffect(() => {
    document.querySelector('[data-tour="page-content"]')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  const update = patch => setForm(current => ({ ...current, ...patch }));
  const capability = context?.capabilities?.[form.templateType] || { enabled: form.templateType === 'DEFAULT' || form.templateType === 'AUTHENTICATION' };
  const stepOneValid = capability.enabled && form.language && form.category && form.templateType;
  const commonValid = /^[a-z0-9_]{1,512}$/.test(form.name) && (form.templateType === 'AUTHENTICATION' || Boolean(form.bodyText.trim()));
  const samplesValid = variables.every(variable => String(form.bodySamples[variable] || '').trim());
  const typeValid = form.templateType === 'CATALOG' ? Boolean(form.catalogId)
    : form.templateType === 'FLOW' ? Boolean(form.flowId && form.flowScreen)
      : form.templateType === 'AUTHENTICATION' && form.otpType !== 'COPY_CODE' ? Boolean(form.packageName && form.signatureHash && (form.otpType !== 'ZERO_TAP' || form.zeroTapAccepted))
        : true;
  const buttonsValid = form.templateType !== 'DEFAULT' || form.buttons.every(button => {
    if (button.type === 'COPY_CODE') return Boolean(button.codeExample?.trim());
    if (!button.text?.trim()) return false;
    if (button.type === 'URL') return /^https?:\/\/.+/i.test(button.url) && (button.urlType !== 'DYNAMIC' || Boolean(button.urlExample?.trim()));
    if (button.type === 'PHONE_NUMBER') return /^\+[1-9]\d{7,14}$/.test(button.phone_number || '');
    return true;
  });
  const headerHasVariable = /\{\{\s*1\s*\}\}/.test(form.headerText);
  const headerValid = form.headerType !== 'TEXT' || (Boolean(form.headerText.trim()) && (!headerHasVariable || Boolean(form.headerSample.trim())));
  const stepTwoValid = commonValid && samplesValid && typeValid && buttonsValid && headerValid && !(['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && !file);

  const selectCategory = category => update({ category, templateType: category === 'AUTHENTICATION' ? 'AUTHENTICATION' : 'DEFAULT' });
  const addVariable = () => {
    const next = variables.length ? Math.max(...variables) + 1 : 1;
    update({ bodyText: `${form.bodyText}${form.bodyText ? ' ' : ''}{{${next}}}` });
  };
  const addButton = () => update({ buttons: [...form.buttons, { type: 'QUICK_REPLY', text: '', url: '', urlType: 'STATIC', urlExample: '', phone_number: '' }] });

  const buildComponents = () => {
    if (form.templateType === 'AUTHENTICATION') return [];
    const components = [];
    if (form.headerType !== 'NONE') components.push({
      type: 'HEADER',
      format: form.headerType,
      ...(form.headerType === 'TEXT' ? { text: form.headerText, ...(headerHasVariable ? { example: { header_text: [form.headerSample] } } : {}) } : {}),
    });
    components.push({
      type: 'BODY', text: form.bodyText,
      ...(variables.length ? { example: { body_text: [variables.map(variable => form.bodySamples[variable])] } } : {}),
    });
    if (form.footerText) components.push({ type: 'FOOTER', text: form.footerText });
    if (form.templateType === 'DEFAULT' && form.buttons.length) {
      components.push({
        type: 'BUTTONS',
        buttons: form.buttons.map(button => button.type === 'URL'
          ? { type: 'URL', text: button.text, url: button.urlType === 'DYNAMIC' ? `${button.url}{{1}}` : button.url, ...(button.urlType === 'DYNAMIC' ? { example: [`${button.url}${button.urlExample}`] } : {}) }
          : button.type === 'PHONE_NUMBER' ? { type: 'PHONE_NUMBER', text: button.text, phone_number: button.phone_number }
            : button.type === 'COPY_CODE' ? { type: 'COPY_CODE', example: button.codeExample }
              : { type: 'QUICK_REPLY', text: button.text }),
      });
    }
    return components;
  };

  const typeConfig = {
    catalog_id: form.catalogId, flow_id: form.flowId, navigate_screen: form.flowScreen, button_text: form.flowButtonText,
    otp_type: form.otpType, add_security_recommendation: form.securityRecommendation,
    code_expiration_minutes: form.expiryMinutes, package_name: form.packageName,
    signature_hash: form.signatureHash, zero_tap_terms_accepted: form.zeroTapAccepted,
  };

  const submit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const payload = new FormData();
      payload.append('name', form.name); payload.append('category', form.category); payload.append('language', form.language);
      payload.append('template_type', form.templateType); payload.append('components', JSON.stringify(buildComponents()));
      payload.append('type_config', JSON.stringify(typeConfig));
      if (file) payload.append('file', file);
      const response = await apiCall(`${API_URL}/api/whatsapp/templates`, { method: 'POST', body: payload });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.validation?.issues?.find(issue => issue.severity === 'error')?.message || json.error || 'Template submission failed.');
      if (draftKey) localStorage.removeItem(draftKey);
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      navigate('/templates', { replace: true });
    } catch (submitFailure) { setSubmitError(submitFailure.message); } finally { setSubmitting(false); }
  };

  const discard = async () => {
    const confirmed = await confirmDialog('Your unsaved template content will be removed.', { title: 'Discard template draft?', confirmLabel: 'Discard', tone: 'danger' });
    if (!confirmed) return;
    if (draftKey) localStorage.removeItem(draftKey);
    navigate('/templates');
  };

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>;
  if (error) return <div className="mx-auto mt-12 max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error.message}</div>;

  return (
    <div className="min-h-full bg-[#f6f8fb]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
          <button onClick={discard} className="flex items-center gap-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" /> Templates</button>
          <ol className="flex items-center gap-2 text-xs font-semibold sm:gap-4 sm:text-sm">
            {['Set up template', 'Edit template', 'Submit for review'].map((label, index) => (
              <li key={label} className={`flex items-center gap-2 ${step >= index + 1 ? 'text-blue-700' : 'text-slate-400'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${step > index + 1 ? 'border-blue-600 bg-blue-600 text-white' : step === index + 1 ? 'border-blue-600 bg-blue-50' : 'border-slate-300'}`}>{step > index + 1 ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                <span className="hidden sm:inline">{label}</span>
              </li>
            ))}
          </ol>
          <span className="text-xs text-slate-500">{context.account.display_phone_number || 'Meta account'}</span>
        </div>
      </header>

      {restored && <div className="mx-auto mt-4 flex max-w-[1280px] items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800"><span>Your saved draft was restored. Media files need to be selected again.</span><button onClick={() => setRestored(false)} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

      <main className="mx-auto grid max-w-[1280px] items-start gap-5 p-4 pb-36 lg:grid-cols-[minmax(0,1fr)_310px] lg:px-6 lg:pb-36 lg:pt-5">
        <div>
          {step === 1 && (
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h1 className="text-xl font-bold text-slate-950">Set up your template</h1>
                <p className="mt-1 text-sm text-slate-600">Choose the purpose first. The editor will only show fields supported by Meta for that template type.</p>
                <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-300">
                  {['MARKETING', 'UTILITY', 'AUTHENTICATION'].map(category => <button key={category} onClick={() => selectCategory(category)} className={`px-3 py-3 text-sm font-semibold ${form.category === category ? 'bg-blue-100 text-blue-800' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{category[0] + category.slice(1).toLowerCase()}</button>)}
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {TYPE_OPTIONS[form.category].map(([value, label, description]) => {
                    const optionCapability = context.capabilities[value] || { enabled: true };
                    return <button key={value} disabled={!optionCapability.enabled} onClick={() => update({ templateType: value })} className={`min-h-[82px] w-full rounded-xl border p-4 text-left transition ${form.templateType === value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70`}>
                      <span className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">{label}</span>{form.templateType === value ? <Check className="h-4 w-4 text-blue-600" /> : !optionCapability.enabled ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-semibold uppercase text-slate-500">Setup required</span> : null}</span>
                      <span className="mt-1 block text-xs text-slate-500">{optionCapability.enabled ? description : optionCapability.reason}</span>
                    </button>;
                  })}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="mb-2 block text-sm font-semibold text-slate-800">Template language</label>
                <LanguageCombobox value={form.language} onChange={language => update({ language })} dropUp />
                <p className="mt-2 text-xs text-slate-500">One language is submitted for review at a time. Meta does not translate your message automatically.</p>
              </section>
              <button onClick={() => navigate('/templates/industries')} className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left"><span className="font-semibold text-emerald-900">Start with Meta’s template library</span><span className="mt-1 block text-sm text-emerald-700">Use pre-approved content instead of starting from scratch.</span></button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-800">Template name<input value={form.name} onChange={event => update({ name: event.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })} className={`${fieldClass} mt-2`} placeholder="order_update_v2" /><span className="mt-1 block text-xs font-normal text-slate-500">Lowercase letters, numbers and underscores.</span></label>
                  <label className="text-sm font-semibold text-slate-800">Language<div className="mt-2"><LanguageCombobox value={form.language} onChange={language => update({ language })} /></div></label>
                </div>
              </section>

              {form.templateType === 'AUTHENTICATION' ? (
                <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div><h2 className="font-semibold text-slate-900">One-time passcode</h2><p className="text-sm text-slate-500">Meta generates the localized verification-code body. You configure delivery and safety options.</p></div>
                  <div className="grid gap-3 sm:grid-cols-3">{[['COPY_CODE', 'Copy code'], ['ONE_TAP', 'One-tap autofill'], ['ZERO_TAP', 'Zero-tap']].map(([value, label]) => <button key={value} onClick={() => update({ otpType: value })} className={`rounded-xl border p-3 text-sm font-semibold ${form.otpType === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>{label}</button>)}</div>
                  <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.securityRecommendation} onChange={event => update({ securityRecommendation: event.target.checked })} /> Add “Do not share this code” recommendation</label>
                  <label className="block text-sm font-semibold">Code expires in minutes<input type="number" min="1" max="90" value={form.expiryMinutes} onChange={event => update({ expiryMinutes: Number(event.target.value) })} className={`${fieldClass} mt-2 max-w-xs`} /></label>
                  {form.otpType !== 'COPY_CODE' && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Android package name<input className={`${fieldClass} mt-2`} value={form.packageName} onChange={event => update({ packageName: event.target.value })} placeholder="com.example.app" /></label><label className="text-sm font-semibold">App signature hash<input className={`${fieldClass} mt-2`} value={form.signatureHash} onChange={event => update({ signatureHash: event.target.value })} /></label></div>}
                  {form.otpType === 'ZERO_TAP' && <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={form.zeroTapAccepted} onChange={event => update({ zeroTapAccepted: event.target.checked })} /><span>I confirm the Android app follows Meta’s zero-tap terms and user disclosure requirements.</span></label>}
                </section>
              ) : (
                <>
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-semibold text-slate-900">Header <span className="font-normal text-slate-400">Optional</span></h2>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{[['NONE', 'None', null], ['TEXT', 'Text', Type], ['IMAGE', 'Image', Image], ['VIDEO', 'Video', Video], ['DOCUMENT', 'Document', FileText]].filter(([value]) => form.templateType !== 'CALL_PERMISSION_REQUEST' || ['NONE', 'TEXT'].includes(value)).map(([value, label, Icon]) => <button key={value} onClick={() => { update({ headerType: value, headerText: '' }); setFile(null); }} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${form.headerType === value ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'}`}>{Icon && <Icon className="h-4 w-4" />}{label}</button>)}</div>
                    {form.headerType === 'TEXT' && <><input className={`${fieldClass} mt-3`} maxLength={60} value={form.headerText} onChange={event => update({ headerText: event.target.value })} placeholder="Order update" />{headerHasVariable && <input className={`${fieldClass} mt-2`} value={form.headerSample} onChange={event => update({ headerSample: event.target.value })} placeholder="Sample for {{1}}" />}</>}
                    {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && (
                      <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 transition hover:border-blue-400 hover:bg-blue-50/40">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><UploadCloud className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">{file?.name || `Upload ${form.headerType.toLowerCase()}`}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{form.headerType === 'IMAGE' ? 'JPG or PNG, up to 5 MB' : form.headerType === 'VIDEO' ? 'MP4, up to 16 MB' : 'PDF or Office document, up to 100 MB'}</span>
                        </span>
                        <span className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Browse</span>
                        <input className="sr-only" type="file" accept={form.headerType === 'IMAGE' ? 'image/jpeg,image/png' : form.headerType === 'VIDEO' ? 'video/mp4' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'} onChange={event => setFile(event.target.files?.[0] || null)} />
                      </label>
                    )}
                  </section>
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex justify-between"><h2 className="font-semibold text-slate-900">Body text</h2><span className="text-xs text-slate-500">{form.bodyText.length}/1024</span></div>
                    <textarea className={`${fieldClass} mt-3 min-h-40 resize-y`} maxLength={1024} value={form.bodyText} onChange={event => update({ bodyText: event.target.value })} placeholder="Hi {{1}}, your order {{2}} has shipped." />
                    <button onClick={addVariable} className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700"><Plus className="h-3.5 w-3.5" /> Add variable</button>
                    {!!variables.length && <div className="mt-3 grid gap-3 rounded-xl bg-blue-50 p-3 sm:grid-cols-2">{variables.map(variable => <label key={variable} className="text-xs font-semibold">Sample for {`{{${variable}}}`}<input className={`${fieldClass} mt-1 bg-white`} value={form.bodySamples[variable] || ''} onChange={event => update({ bodySamples: { ...form.bodySamples, [variable]: event.target.value } })} /></label>)}</div>}
                  </section>
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><label className="text-sm font-semibold">Footer <span className="font-normal text-slate-400">Optional</span><input className={`${fieldClass} mt-2`} maxLength={60} value={form.footerText} onChange={event => update({ footerText: event.target.value })} /></label></section>
                </>
              )}

              {form.templateType === 'CATALOG' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><label className="text-sm font-semibold">Connected catalog<select className={`${fieldClass} mt-2`} value={form.catalogId} onChange={event => update({ catalogId: event.target.value })}><option value="">Select catalog</option>{context.catalogs.map(catalog => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">Meta adds the fixed “View catalog” action automatically.</p></section>}
              {form.templateType === 'FLOW' && <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"><label className="text-sm font-semibold">Published Meta Flow<select className={`${fieldClass} mt-2`} value={form.flowId} onChange={event => update({ flowId: event.target.value, flowScreen: '' })}><option value="">Select flow</option>{context.flows.map(flow => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select></label><label className="text-sm font-semibold">Destination screen<input className={`${fieldClass} mt-2`} value={form.flowScreen} onChange={event => update({ flowScreen: event.target.value })} placeholder={flowScreens[0]?.id || 'WELCOME_SCREEN'} list="flow-screens" /><datalist id="flow-screens">{flowScreens.map(screen => <option key={screen.id} value={screen.id} />)}</datalist></label><label className="text-sm font-semibold md:col-span-2">Button label<input className={`${fieldClass} mt-2`} maxLength={25} value={form.flowButtonText} onChange={event => update({ flowButtonText: event.target.value })} /></label></section>}
              {form.templateType === 'CALL_PERMISSION_REQUEST' && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldCheck className="mr-2 inline h-4 w-4" />WhatsApp renders the permission controls. Customers can allow, temporarily allow, or decline calls; this system component cannot be edited.</section>}

              {form.templateType === 'DEFAULT' && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">Buttons <span className="font-normal text-slate-400">Optional</span></h2>
                      <p className="mt-0.5 text-xs text-slate-500">Add replies or actions customers can tap.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{form.buttons.length}/10</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {form.buttons.map((button, index) => (
                      <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Button {index + 1}</span>
                          <button aria-label="Remove button" onClick={() => update({ buttons: form.buttons.filter((_, itemIndex) => itemIndex !== index) })} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[['QUICK_REPLY', 'Quick reply'], ['URL', 'Website'], ['PHONE_NUMBER', 'Phone'], ['COPY_CODE', 'Copy code']].map(([value, label]) => (
                            <button key={value} type="button" onClick={() => update({ buttons: form.buttons.map((item, itemIndex) => itemIndex === index ? { type: value, text: '', url: '', urlType: 'STATIC', urlExample: '', phone_number: '' } : item) })} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${button.type === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{label}</button>
                          ))}
                        </div>
                        {button.type !== 'COPY_CODE' && <input className={`${fieldClass} mt-3`} maxLength={25} value={button.text || ''} onChange={event => update({ buttons: form.buttons.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} placeholder="Button label" />}
                        {button.type === 'URL' && (
                          <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div>
                              <span className="mb-2 block text-xs font-semibold text-slate-700">URL behavior</span>
                              <div className="grid grid-cols-2 gap-2">
                                {[['STATIC', 'Same for everyone'], ['DYNAMIC', 'Customer-specific']].map(([value, label]) => <button key={value} type="button" onClick={() => update({ buttons: form.buttons.map((item, itemIndex) => itemIndex === index ? { ...item, urlType: value, urlExample: '' } : item) })} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${button.urlType === value ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>{label}</button>)}
                              </div>
                            </div>
                            <input className={fieldClass} value={button.url || ''} onChange={event => update({ buttons: form.buttons.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value.replace(/\{\{1\}\}$/, '') } : item) })} placeholder={button.urlType === 'DYNAMIC' ? 'https://example.com/order/' : 'https://example.com'} />
                            {button.urlType === 'DYNAMIC' && <div><input className={fieldClass} value={button.urlExample || ''} onChange={event => update({ buttons: form.buttons.map((item, itemIndex) => itemIndex === index ? { ...item, urlExample: event.target.value } : item) })} placeholder="Example value: ORD-10834" /><p className="mt-1 text-[11px] text-slate-500">The customer value is appended to the URL when sending.</p></div>}
                          </div>
                        )}
                        {button.type === 'PHONE_NUMBER' && <input className={`${fieldClass} mt-3`} value={button.phone_number || ''} onChange={event => update({ buttons: form.buttons.map((item, itemIndex) => itemIndex === index ? { ...item, phone_number: `+${event.target.value.replace(/\D/g, '')}` } : item) })} placeholder="+919999999999" />}
                        {button.type === 'COPY_CODE' && <input className={`${fieldClass} mt-3`} value={button.codeExample || ''} onChange={event => update({ buttons: form.buttons.map((item, itemIndex) => itemIndex === index ? { ...item, codeExample: event.target.value } : item) })} placeholder="Example offer code" />}
                      </div>
                    ))}
                    {form.buttons.length < 10 && <button onClick={addButton} className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"><Plus className="h-4 w-4" /> Add button</button>}
                  </div>
                </section>
              )}
            </div>
          )}

          {step === 3 && <div className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">Review and submit</h1><p className="mt-1 text-sm text-slate-500">Meta will review this language version before it can be sent.</p><dl className="mt-6 grid gap-4 sm:grid-cols-2">{[['Template', form.name], ['Category', form.category], ['Type', form.templateType.replaceAll('_', ' ')], ['Language', `${getMetaLanguage(form.language).label} · ${form.language}`]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>)}</dl>{submitError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}</section><section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Submission ke baad status Pending hoga. Approval, rejection, aur Meta category changes Templates list mein sync honge.</section></div>}
        </div>
        <aside className="hidden lg:block"><div className="sticky top-32 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><WhatsAppPreview form={form} mediaUrl={mediaUrl} /></div></aside>
      </main>

      {showMobilePreview && <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-4 lg:hidden"><button onClick={() => setShowMobilePreview(false)} className="mb-4 flex items-center gap-2 font-semibold"><X className="h-5 w-5" /> Close preview</button><WhatsAppPreview form={form} mediaUrl={mediaUrl} /></div>}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:left-56">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3">
          <button onClick={step === 1 ? discard : () => setStep(step - 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{step === 1 ? 'Discard' : 'Back'}</button>
          {step === 2 && !stepTwoValid && <span className="hidden text-xs text-slate-500 sm:block">Complete the required fields to continue.</span>}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMobilePreview(true)} className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 lg:hidden">Preview</button>
            {step < 3 ? <button disabled={step === 1 ? !stepOneValid : !stepTwoValid} onClick={() => setStep(step + 1)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              : <button disabled={submitting} onClick={submit} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit for review</button>}
          </div>
        </div>
      </footer>
    </div>
  );
}
