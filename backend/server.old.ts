import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import path from "path";
import twilio from "twilio";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  makeCacheableSignalKeyStore,
  Browsers,
  proto,
} from "@whiskeysockets/baileys";
import * as fs from "fs";
import { sendEmail } from "./email.js";
import pino from "pino";

const app = express();
const extraCorsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:3001",
  "https://parted-deuce-penpal.ngrok-free.dev",
  "https://w.getaipilot.in",
  "https://wb.getaipilot.in",
  ...extraCorsOrigins,
];

const corsAllowedHeaders = [
  "Content-Type",
  "Authorization",
  "X-Auth-Portal",
  "X-N8N-Secret",
  "ngrok-skip-browser-warning",
];

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: corsAllowedHeaders,
  }),
);

// Keep raw body for Meta signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: corsAllowedHeaders,
    credentials: true,
  },
});

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const N8N_HANDOFF_WEBHOOK_URL = process.env.N8N_HANDOFF_WEBHOOK_URL || "";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";
const N8N_WEBHOOK_TIMEOUT_MS = Number(
  process.env.N8N_WEBHOOK_TIMEOUT_MS || 15000,
);
const DEFAULT_BILLING_MARKET = process.env.WHATSAPP_BILLING_MARKET || "IN";
const DEFAULT_BILLING_CURRENCY = process.env.WHATSAPP_BILLING_CURRENCY || "INR";
const META_EMBEDDED_SIGNUP_VERSION =
  process.env.META_EMBEDDED_SIGNUP_VERSION || "v4";
const META_EMBEDDED_SESSION_INFO_VERSION =
  process.env.META_EMBEDDED_SESSION_INFO_VERSION || "3";

const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "wa-media";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const KNOWLEDGE_MAX_FILE_SIZE = 10 * 1024 * 1024;
const KNOWLEDGE_MAX_CONTEXT_CHARS = 80_000;
const KNOWLEDGE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const DEFAULT_WHATSAPP_RATE_CARD: Record<
  string,
  { category: string; label: string; rate_paise: number; description: string }
> = {
  marketing: {
    category: "marketing",
    label: "Marketing",
    rate_paise: 88,
    description:
      "Promotions, offers, re-engagement, abandoned cart, and campaign templates.",
  },
  utility: {
    category: "utility",
    label: "Utility",
    rate_paise: 13,
    description:
      "Order, payment, appointment, shipping, and account updates requested by the user.",
  },
  authentication: {
    category: "authentication",
    label: "Authentication",
    rate_paise: 13,
    description: "OTP and verification templates.",
  },
  service: {
    category: "service",
    label: "Service",
    rate_paise: 0,
    description: "Replies inside the customer service window.",
  },
};

function buildMetaEmbeddedSignupUrl() {
  if (process.env.META_EMBEDDED_SIGNUP_URL)
    return process.env.META_EMBEDDED_SIGNUP_URL;
  const appId = process.env.META_APP_ID || "";
  const configId = process.env.META_CONFIG_ID || "";
  const extras = {
    sessionInfoVersion: META_EMBEDDED_SESSION_INFO_VERSION,
    version: META_EMBEDDED_SIGNUP_VERSION,
  };
  const url = new URL(
    "https://business.facebook.com/messaging/whatsapp/onboard/",
  );
  if (appId) url.searchParams.set("app_id", appId);
  if (configId) url.searchParams.set("config_id", configId);
  url.searchParams.set("extras", JSON.stringify(extras));
  return url.toString();
}

type WhatsappBillingCategory =
  | "marketing"
  | "utility"
  | "authentication"
  | "service";

type TemplateValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  field?: string;
};

const TEMPLATE_CATEGORIES = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);
const TEMPLATE_HEADER_FORMATS = new Set(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]);
const TEMPLATE_LANG_RE = /^[a-z]{2}(?:_[A-Z]{2})?$/;
const PROMOTIONAL_WORD_RE =
  /\b(discount|offer|sale|deal|promo|coupon|cashback|free|limited time|buy now|save|off|exclusive|hurry|register now|enroll now|launch|upgrade)\b/i;
const OTP_WORD_RE =
  /\b(otp|one[-\s]?time|verification code|verify|login code|security code|passcode|authentication)\b/i;

function extractTemplateVariables(text: string) {
  return [...String(text || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) =>
    Number(match[1]),
  );
}

function getBodyExampleValues(component: any): string[] {
  const bodyText = component?.example?.body_text;
  if (Array.isArray(bodyText?.[0]))
    return bodyText[0].map((value: any) => String(value ?? ""));
  if (Array.isArray(bodyText))
    return bodyText.map((value: any) => String(value ?? ""));
  return [];
}

function hasHeaderMediaExample(component: any) {
  const example = component?.example || {};
  return Boolean(example.header_handle?.[0] || example.header_url?.[0]);
}

function validateVariableSequence(
  text: string,
  sampleValues: string[],
  field: string,
  issues: TemplateValidationIssue[],
) {
  const vars = [...new Set(extractTemplateVariables(text))].sort(
    (a, b) => a - b,
  );
  if (!vars.length) return;

  for (let index = 1; index <= vars[vars.length - 1]; index += 1) {
    if (!vars.includes(index)) {
      issues.push({
        code: "VARIABLE_SEQUENCE_GAP",
        severity: "error",
        field,
        message: `Variables must be sequential. Add {{${index}}} or renumber the placeholders.`,
      });
    }
  }

  vars.forEach((variable) => {
    const sample = sampleValues[variable - 1];
    if (!String(sample || "").trim()) {
      issues.push({
        code: "VARIABLE_SAMPLE_REQUIRED",
        severity: "error",
        field,
        message: `Sample value is required for {{${variable}}}.`,
      });
    }
  });

  if (
    /^\s*\{\{\s*\d+\s*\}\}/.test(text) ||
    /\{\{\s*\d+\s*\}\}\s*$/.test(text)
  ) {
    issues.push({
      code: "VARIABLE_AT_EDGE",
      severity: "error",
      field,
      message:
        "Do not start or end a template field with a variable. Add clear fixed text around it.",
    });
  }
}

function validateWhatsappTemplatePayload(payload: any) {
  const issues: TemplateValidationIssue[] = [];
  const normalized = {
    name: String(payload?.name || "")
      .trim()
      .toLowerCase(),
    category: String(payload?.category || "")
      .trim()
      .toUpperCase(),
    language: String(payload?.language || "en_US").trim(),
    components: Array.isArray(payload?.components) ? payload.components : [],
  };

  if (!/^[a-z0-9_]{1,512}$/.test(normalized.name)) {
    issues.push({
      code: "INVALID_NAME",
      severity: "error",
      field: "name",
      message:
        "Template name must use lowercase letters, numbers, and underscores only.",
    });
  }
  if (!TEMPLATE_CATEGORIES.has(normalized.category)) {
    issues.push({
      code: "INVALID_CATEGORY",
      severity: "error",
      field: "category",
      message: "Category must be MARKETING, UTILITY, or AUTHENTICATION.",
    });
  }
  if (!TEMPLATE_LANG_RE.test(normalized.language)) {
    issues.push({
      code: "INVALID_LANGUAGE",
      severity: "error",
      field: "language",
      message: "Use a WhatsApp language code like en_US or hi.",
    });
  }

  const components = normalized.components;
  const body = components.find((component: any) => component?.type === "BODY");
  const headers = components.filter(
    (component: any) => component?.type === "HEADER",
  );
  const footers = components.filter(
    (component: any) => component?.type === "FOOTER",
  );
  const buttonsComp = components.find(
    (component: any) => component?.type === "BUTTONS",
  );
  const allText = components
    .map((component: any) =>
      [
        component?.text,
        ...(component?.buttons || []).map((button: any) => button?.text),
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");

  if (!body?.text?.trim()) {
    issues.push({
      code: "BODY_REQUIRED",
      severity: "error",
      field: "body",
      message: "Body text is required.",
    });
  } else {
    const bodyText = String(body.text);
    if (bodyText.length > 1024) {
      issues.push({
        code: "BODY_TOO_LONG",
        severity: "error",
        field: "body",
        message: "Body text must be 1024 characters or less.",
      });
    }
    validateVariableSequence(
      bodyText,
      getBodyExampleValues(body),
      "body",
      issues,
    );
  }

  if (headers.length > 1) {
    issues.push({
      code: "MULTIPLE_HEADERS",
      severity: "error",
      field: "header",
      message: "Only one header component is allowed.",
    });
  }
  if (headers[0]) {
    const header = headers[0];
    if (!TEMPLATE_HEADER_FORMATS.has(String(header.format || ""))) {
      issues.push({
        code: "INVALID_HEADER_FORMAT",
        severity: "error",
        field: "header",
        message: "Header must be TEXT, IMAGE, VIDEO, or DOCUMENT.",
      });
    }
    if (header.format === "TEXT") {
      if (!String(header.text || "").trim())
        issues.push({
          code: "HEADER_TEXT_REQUIRED",
          severity: "error",
          field: "header",
          message: "Text header requires text.",
        });
      if (String(header.text || "").length > 60)
        issues.push({
          code: "HEADER_TOO_LONG",
          severity: "error",
          field: "header",
          message: "Text header must be 60 characters or less.",
        });
      const headerVars = extractTemplateVariables(header.text || "");
      if (headerVars.length > 1)
        issues.push({
          code: "HEADER_TOO_MANY_VARIABLES",
          severity: "error",
          field: "header",
          message: "Text header supports at most one variable.",
        });
      validateVariableSequence(
        String(header.text || ""),
        header.example?.header_text || [],
        "header",
        issues,
      );
    } else if (!hasHeaderMediaExample(header)) {
      issues.push({
        code: "HEADER_MEDIA_SAMPLE_REQUIRED",
        severity: "error",
        field: "header",
        message: `${header.format} header requires an uploaded sample before Meta review.`,
      });
    }
  }

  if (footers.length > 1) {
    issues.push({
      code: "MULTIPLE_FOOTERS",
      severity: "error",
      field: "footer",
      message: "Only one footer component is allowed.",
    });
  }
  if (footers[0]?.text) {
    if (String(footers[0].text).length > 60)
      issues.push({
        code: "FOOTER_TOO_LONG",
        severity: "error",
        field: "footer",
        message: "Footer must be 60 characters or less.",
      });
    if (extractTemplateVariables(footers[0].text).length)
      issues.push({
        code: "FOOTER_VARIABLES_NOT_ALLOWED",
        severity: "error",
        field: "footer",
        message: "Footer cannot contain variables.",
      });
  }

  const buttons = Array.isArray(buttonsComp?.buttons)
    ? buttonsComp.buttons
    : [];
  if (buttons.length > 10)
    issues.push({
      code: "TOO_MANY_BUTTONS",
      severity: "error",
      field: "buttons",
      message: "Templates support up to 10 buttons.",
    });
  const urlButtons = buttons.filter((button: any) => button?.type === "URL");
  const phoneButtons = buttons.filter(
    (button: any) => button?.type === "PHONE_NUMBER",
  );
  const quickButtons = buttons.filter(
    (button: any) => button?.type === "QUICK_REPLY",
  );
  if (urlButtons.length > 2)
    issues.push({
      code: "TOO_MANY_URL_BUTTONS",
      severity: "error",
      field: "buttons",
      message: "Use at most two URL buttons.",
    });
  if (phoneButtons.length > 1)
    issues.push({
      code: "TOO_MANY_PHONE_BUTTONS",
      severity: "error",
      field: "buttons",
      message: "Use at most one phone button.",
    });
  if (quickButtons.length > 10)
    issues.push({
      code: "TOO_MANY_QUICK_REPLY_BUTTONS",
      severity: "error",
      field: "buttons",
      message: "Use at most ten quick reply buttons.",
    });

  buttons.forEach((button: any, index: number) => {
    const label = String(button?.text || "").trim();
    if (!label)
      issues.push({
        code: "BUTTON_TEXT_REQUIRED",
        severity: "error",
        field: `buttons.${index}`,
        message: "Button text is required.",
      });
    if (label.length > 25)
      issues.push({
        code: "BUTTON_TEXT_TOO_LONG",
        severity: "error",
        field: `buttons.${index}`,
        message: "Button text must be 25 characters or less.",
      });
    if (button?.type === "URL") {
      const url = String(button.url || "").trim();
      if (!/^https?:\/\/.+/i.test(url))
        issues.push({
          code: "INVALID_BUTTON_URL",
          severity: "error",
          field: `buttons.${index}.url`,
          message: "URL button must start with http:// or https://.",
        });
      const vars = extractTemplateVariables(url);
      if (
        vars.length > 1 ||
        (vars.length === 1 && !/\{\{\s*\d+\s*\}\}\s*$/.test(url))
      ) {
        issues.push({
          code: "INVALID_DYNAMIC_URL",
          severity: "error",
          field: `buttons.${index}.url`,
          message:
            "Dynamic URL can contain one variable, and it must be at the end of the URL.",
        });
      }
    }
    if (
      button?.type === "PHONE_NUMBER" &&
      !/^\+[1-9]\d{7,14}$/.test(String(button.phone_number || ""))
    ) {
      issues.push({
        code: "INVALID_PHONE_BUTTON",
        severity: "error",
        field: `buttons.${index}.phone_number`,
        message:
          "Phone button must use E.164 format, for example +919999999999.",
      });
    }
    if (
      !["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE", "OTP"].includes(
        String(button?.type || ""),
      )
    ) {
      issues.push({
        code: "INVALID_BUTTON_TYPE",
        severity: "error",
        field: `buttons.${index}.type`,
        message: "Unsupported button type.",
      });
    }
  });

  if (normalized.category === "UTILITY" && PROMOTIONAL_WORD_RE.test(allText)) {
    issues.push({
      code: "UTILITY_PROMOTIONAL_CONTENT",
      severity: "error",
      field: "category",
      message:
        "Utility templates cannot include promotional language. Use Marketing for offers, discounts, sales, or acquisition CTAs.",
    });
  }
  if (normalized.category !== "AUTHENTICATION" && OTP_WORD_RE.test(allText)) {
    issues.push({
      code: "OTP_REQUIRES_AUTHENTICATION",
      severity: "error",
      field: "category",
      message:
        "OTP or verification-code content must use the Authentication category.",
    });
  }
  if (normalized.category === "AUTHENTICATION") {
    if (headers.length || footers.length)
      issues.push({
        code: "AUTH_NO_HEADER_FOOTER",
        severity: "error",
        field: "components",
        message:
          "Authentication templates should not include custom headers or footers.",
      });
    if (PROMOTIONAL_WORD_RE.test(allText))
      issues.push({
        code: "AUTH_PROMOTIONAL_CONTENT",
        severity: "error",
        field: "body",
        message:
          "Authentication templates cannot contain promotional language.",
      });
    const authVars = body?.text ? getBodyExampleValues(body) : [];
    if (!extractTemplateVariables(body?.text || "").length)
      issues.push({
        code: "AUTH_VARIABLE_REQUIRED",
        severity: "error",
        field: "body",
        message:
          "Authentication templates require an OTP variable such as {{1}}.",
      });
    if (authVars.some((value) => String(value || "").length > 15))
      issues.push({
        code: "AUTH_SAMPLE_TOO_LONG",
        severity: "error",
        field: "body",
        message: "Authentication sample values must be 15 characters or less.",
      });
    if (!OTP_WORD_RE.test(allText))
      issues.push({
        code: "AUTH_OTP_WORDING_REQUIRED",
        severity: "warning",
        field: "body",
        message:
          "Authentication templates should clearly describe a verification code.",
      });
  }

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const riskScore = Math.min(100, errorCount * 35 + warningCount * 12);
  const approvalState =
    errorCount > 0 ? "blocked" : warningCount > 0 ? "needs_review" : "ready";

  return {
    normalized,
    issues,
    riskScore,
    approvalState,
    canSubmit: errorCount === 0,
  };
}

function normalizeWhatsappBillingCategory(
  value: any,
  fallback: WhatsappBillingCategory = "marketing",
): WhatsappBillingCategory {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (raw.includes("utility")) return "utility";
  if (raw.includes("auth")) return "authentication";
  if (raw.includes("service")) return "service";
  if (raw.includes("marketing")) return "marketing";
  return fallback;
}

async function getActiveWhatsappRate(category: WhatsappBillingCategory) {
  const fallback =
    DEFAULT_WHATSAPP_RATE_CARD[category] ||
    DEFAULT_WHATSAPP_RATE_CARD.marketing;
  try {
    const { data, error } = await supabase
      .from("whatsapp_rate_cards")
      .select("rate_paise, pass_through_rate_paise, markup_paise")
      .eq("market", DEFAULT_BILLING_MARKET)
      .eq("currency", DEFAULT_BILLING_CURRENCY)
      .eq("category", category)
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return {
        rate_paise: fallback.rate_paise,
        pass_through_rate_paise: fallback.rate_paise,
        markup_paise: 0,
      };
    }
    return data;
  } catch {
    return {
      rate_paise: fallback.rate_paise,
      pass_through_rate_paise: fallback.rate_paise,
      markup_paise: 0,
    };
  }
}

async function recordWhatsappMessageUsage(params: {
  organization_id: string;
  wa_account_id?: string | null;
  campaign_id?: string | null;
  conversation_id?: string | null;
  contact_id?: string | null;
  message_id?: string | null;
  wa_message_id?: string | null;
  category: WhatsappBillingCategory;
  template_name?: string | null;
  source?: "manual" | "broadcast" | "flow" | "ai_agent" | "webhook" | "system";
}) {
  const category = normalizeWhatsappBillingCategory(params.category);
  const rate = await getActiveWhatsappRate(category);
  const chargedAmount =
    category === "service" ? 0 : Number(rate.rate_paise || 0);
  const now = new Date().toISOString();
  let billingStatus: "charged" | "free" | "failed" =
    chargedAmount > 0 ? "charged" : "free";
  let walletTransactionId: string | null = null;

  try {
    if (chargedAmount > 0) {
      const { data: wallet } = await supabase
        .from("whatsapp_wallets")
        .select("balance_paise, currency")
        .eq("organization_id", params.organization_id)
        .maybeSingle();

      if (!wallet) {
        await supabase.from("whatsapp_wallets").insert({
          organization_id: params.organization_id,
          currency: DEFAULT_BILLING_CURRENCY,
        });
        billingStatus = "failed";
      } else if (Number(wallet.balance_paise || 0) >= chargedAmount) {
        const nextBalance = Number(wallet.balance_paise || 0) - chargedAmount;
        const { error: walletErr } = await supabase
          .from("whatsapp_wallets")
          .update({ balance_paise: nextBalance, updated_at: now })
          .eq("organization_id", params.organization_id)
          .gte("balance_paise", chargedAmount);

        if (walletErr) {
          billingStatus = "failed";
        } else {
          const { data: tx } = await supabase
            .from("whatsapp_wallet_transactions")
            .insert({
              organization_id: params.organization_id,
              type: "message_debit",
              amount_paise: -chargedAmount,
              balance_after_paise: nextBalance,
              currency: DEFAULT_BILLING_CURRENCY,
              status: "completed",
              reference_type: params.source || "message",
              reference_id:
                params.message_id ||
                params.wa_message_id ||
                params.campaign_id ||
                null,
              description: `${DEFAULT_WHATSAPP_RATE_CARD[category]?.label || category} WhatsApp message charge`,
              metadata: {
                category,
                template_name: params.template_name || null,
                campaign_id: params.campaign_id || null,
              },
            })
            .select("id")
            .maybeSingle();
          walletTransactionId = tx?.id || null;
        }
      } else {
        billingStatus = "failed";
        await supabase.from("whatsapp_wallet_transactions").insert({
          organization_id: params.organization_id,
          type: "failed_debit",
          amount_paise: -chargedAmount,
          balance_after_paise: Number(wallet.balance_paise || 0),
          currency: DEFAULT_BILLING_CURRENCY,
          status: "failed",
          reference_type: params.source || "message",
          reference_id:
            params.message_id ||
            params.wa_message_id ||
            params.campaign_id ||
            null,
          description: `Insufficient wallet balance for ${category} WhatsApp message charge`,
          metadata: { category, template_name: params.template_name || null },
        });
      }

      if (params.message_id) {
        await supabase
          .from("w_messages")
          .update({
            billing_category: category,
            billing_amount_paise: chargedAmount,
            billing_status: billingStatus,
          })
          .eq("id", params.message_id);
      }
    } else if (params.message_id) {
      await supabase
        .from("w_messages")
        .update({
          billing_category: category,
          billing_amount_paise: 0,
          billing_status: "free",
        })
        .eq("id", params.message_id);
    }

    await supabase.from("whatsapp_message_usage_logs").insert({
      organization_id: params.organization_id,
      wa_account_id: params.wa_account_id || null,
      campaign_id: params.campaign_id || null,
      conversation_id: params.conversation_id || null,
      contact_id: params.contact_id || null,
      message_id: params.message_id || null,
      wa_message_id: params.wa_message_id || null,
      direction: "outbound",
      source: params.source || "system",
      category,
      template_name: params.template_name || null,
      recipient_country: DEFAULT_BILLING_MARKET,
      rate_paise: chargedAmount,
      meta_cost_paise: Number(rate.pass_through_rate_paise || chargedAmount),
      markup_paise: Number(rate.markup_paise || 0),
      charged_amount_paise: chargedAmount,
      billable: chargedAmount > 0,
      billing_status: billingStatus,
      delivery_status: "sent",
      wallet_transaction_id: walletTransactionId,
      metadata: {
        market: DEFAULT_BILLING_MARKET,
        currency: DEFAULT_BILLING_CURRENCY,
      },
    });
  } catch (err: any) {
    console.warn(
      "[billing] Failed to record WhatsApp message usage:",
      err?.message || err,
    );
  }
}

async function getOrganizationPlanLimits(organizationId: string) {
  const { data: org } = await supabase
    .from("organizations")
    .select("plan_id")
    .eq("id", organizationId)
    .maybeSingle();

  const planId = org?.plan_id || null;
  const { data: plan } = planId
    ? await supabase
        .from("whatsapp_subscription_plans")
        .select("id, name, limits")
        .eq("id", planId)
        .maybeSingle()
    : { data: null };

  return {
    plan_id: plan?.id || planId,
    plan_name: plan?.name || "No active plan",
    limits: plan?.limits || {},
  };
}

async function countBroadcastAudience(
  organizationId: string,
  audienceTag?: string | null,
  csvData?: any[] | null,
  audienceType?: string,
) {
  if (Array.isArray(csvData)) {
    return csvData.filter((row) => row?.phone || row?.wa_id).length;
  }

  let query = supabase
    .from("w_contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("contact_type", "individual");

  if (audienceType === "saved") {
    query = query.not("saved_at", "is", null);
  } else if (audienceType === "tag" && audienceTag) {
    query = query.contains("tags", [audienceTag]);
  } else if (audienceTag) {
    // Fallback for old behaviour
    query = query.contains("tags", [audienceTag]);
  }

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

async function getBroadcastCampaignsThisMonth(organizationId: string) {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const { count, error } = await supabase
    .from("w_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", monthStart);
  if (error) throw error;
  return Number(count || 0);
}

async function buildBroadcastBillingEstimate(params: {
  organization_id: string;
  audience_tag?: string | null;
  audience_type?: string | null;
  csv_data?: any[] | null;
  template_category?: any;
}) {
  const category = normalizeWhatsappBillingCategory(
    params.template_category,
    "marketing",
  );
  const rate = await getActiveWhatsappRate(category);
  const audienceCount = await countBroadcastAudience(
    params.organization_id,
    params.audience_tag || null,
    params.csv_data || null,
    params.audience_type || "all",
  );
  const estimatedCostPaise = audienceCount * Number(rate.rate_paise || 0);
  const [{ data: wallet }, planInfo, campaignsThisMonth] = await Promise.all([
    supabase
      .from("whatsapp_wallets")
      .select("balance_paise, currency")
      .eq("organization_id", params.organization_id)
      .maybeSingle(),
    getOrganizationPlanLimits(params.organization_id),
    getBroadcastCampaignsThisMonth(params.organization_id),
  ]);

  const walletBalancePaise = Number(wallet?.balance_paise || 0);
  const broadcastsLimit = Number(planInfo.limits?.broadcasts_per_month ?? 0);
  const broadcastsRemaining =
    broadcastsLimit < 0
      ? -1
      : Math.max(0, broadcastsLimit - campaignsThisMonth);
  const allowedByPlan =
    broadcastsLimit < 0 || campaignsThisMonth < broadcastsLimit;
  const enoughWallet = estimatedCostPaise <= walletBalancePaise;

  return {
    category,
    audience_count: audienceCount,
    rate_paise: Number(rate.rate_paise || 0),
    estimated_cost_paise: estimatedCostPaise,
    wallet_balance_paise: walletBalancePaise,
    wallet_after_paise: walletBalancePaise - estimatedCostPaise,
    enough_wallet: enoughWallet,
    plan: {
      id: planInfo.plan_id,
      name: planInfo.plan_name,
      broadcasts_per_month: broadcastsLimit,
      broadcasts_used_this_month: campaignsThisMonth,
      broadcasts_remaining: broadcastsRemaining,
      allowed: allowedByPlan,
    },
    can_launch: audienceCount > 0 && enoughWallet && allowedByPlan,
  };
}

async function enforcePlanResourceLimit(params: {
  organization_id: string;
  resource: "contacts" | "flows" | "ai_agents" | "agents" | "numbers";
  table: string;
  countColumn?: string;
  filters?: Record<string, any>;
  label: string;
}) {
  const planInfo = await getOrganizationPlanLimits(params.organization_id);
  const limit = Number(planInfo.limits?.[params.resource] ?? -1);
  if (limit < 0) return { allowed: true, limit, used: 0, plan: planInfo };

  let query = supabase
    .from(params.table)
    .select(params.countColumn || "id", { count: "exact", head: true })
    .eq("organization_id", params.organization_id);

  for (const [key, value] of Object.entries(params.filters || {})) {
    if (Array.isArray(value)) query = query.in(key, value);
    else query = query.eq(key, value);
  }

  const { count, error } = await query;
  if (error) throw error;
  const used = Number(count || 0);

  if (used >= limit) {
    const err: any = new Error(
      `${params.label} limit reached for ${planInfo.plan_name} plan (${used}/${limit}). Upgrade your plan to add more.`,
    );
    err.statusCode = 402;
    err.limit = { resource: params.resource, used, limit, plan: planInfo };
    throw err;
  }

  return { allowed: true, limit, used, plan: planInfo };
}

async function enforceWhatsAppCloudNumberLimit(
  organizationId: string,
  phoneNumberId: string,
) {
  const { data: existingAccount, error: existingAccountErr } = await supabase
    .from("w_wa_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (existingAccountErr) throw existingAccountErr;
  if (existingAccount?.id) return existingAccount;

  const planInfo = await getOrganizationPlanLimits(organizationId);
  const limit = Number(planInfo.limits?.numbers ?? -1);
  if (limit < 0) return null;

  const { count, error } = await supabase
    .from("w_wa_accounts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["connected", "active"])
    .not("whatsapp_business_account_id", "is", null);
  if (error) throw error;

  const used = Number(count || 0);
  if (used >= limit) {
    const err: any = new Error(
      `WhatsApp number limit reached for ${planInfo.plan_name} plan (${used}/${limit}). Upgrade your plan to add more.`,
    );
    err.statusCode = 402;
    err.limit = { resource: "numbers", used, limit, plan: planInfo };
    throw err;
  }

  return null;
}

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use("/uploads", express.static(UPLOADS_DIR));

// ====== Baileys Global Session State ======
const sessions = new Map<string, any>();
const latestQrBySession = new Map<string, { qr: string; createdAt: number }>();
const groupNameCache = new Map<
  string,
  { subject: string; fetchedAt: number }
>();
const GROUP_NAME_TTL_MS = 5 * 60 * 1000;
const profilePhotoCache = new Map<
  string,
  { url: string | null; fetchedAt: number }
>();
const PROFILE_PHOTO_TTL_MS = 30 * 60 * 1000;
const initializingSessions = new Set<string>();
const reconnectAttempts = new Map<string, number>();
const MAX_RECONNECT_ATTEMPTS = 5;

// ====== ENV ======
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN!;
const APP_SECRET = process.env.META_APP_SECRET!;
const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN!;
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID!;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ====== AES-256-CBC Token Encryption ======
// TOKEN_ENCRYPTION_KEY must be exactly 32 ASCII characters in .env
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || "";

function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    console.warn(
      "âš ï¸ TOKEN_ENCRYPTION_KEY not set or not 32 chars â€” storing token unencrypted!",
    );
    return token;
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv,
  );
  const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptToken(stored: string | null | undefined): string {
  if (!stored) {
    return "";
  }
  if (
    !ENCRYPTION_KEY ||
    ENCRYPTION_KEY.length !== 32 ||
    !stored.includes(":")
  ) {
    // Not encrypted (legacy plain-text or key not set) — return as-is
    return stored;
  }
  try {
    const [ivHex, encHex] = stored.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, "hex")),
      decipher.final(),
    ]).toString();
  } catch {
    // Fallback: might be a legacy plain-text token
    return stored;
  }
}

async function inspectMetaTokenPermissions(token: string) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret || !token) {
    return {
      checked: false,
      is_valid: null,
      expires_at: null,
      missingScopes: [],
      scopes: [],
      error: null,
    };
  }

  try {
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const response = await fetch(debugUrl);
    const data: any = await response.json();
    if (!response.ok || data.error) {
      return {
        checked: true,
        is_valid: false,
        expires_at: null,
        missingScopes: [],
        scopes: [],
        error: data.error?.message || "Unable to inspect Meta token",
      };
    }

    const scopes = Array.isArray(data.data?.scopes) ? data.data.scopes : [];
    const requiredScopes = [
      "whatsapp_business_messaging",
      "whatsapp_business_management",
    ];
    const missingScopes = requiredScopes.filter(
      (scope) => !scopes.includes(scope),
    );
    return {
      checked: true,
      is_valid: data.data?.is_valid ?? null,
      expires_at: data.data?.expires_at || null,
      missingScopes,
      scopes,
      error:
        data.data?.is_valid === false
          ? "Meta access token is no longer valid."
          : null,
    };
  } catch (err: any) {
    return {
      checked: true,
      is_valid: null,
      expires_at: null,
      missingScopes: [],
      scopes: [],
      error: err.message || "Unable to inspect Meta token",
    };
  }
}

function getMetaIssueCode(error: any) {
  const message = String(
    error?.message || error?.error_user_msg || "",
  ).toLowerCase();
  const code = Number(error?.code);
  const subcode = Number(error?.error_subcode);

  if (
    code === 190 ||
    subcode === 463 ||
    subcode === 467 ||
    message.includes("session has expired") ||
    message.includes("error validating access token") ||
    message.includes("access token has expired")
  ) {
    return "token_expired";
  }

  if (code === 10 || code === 200 || message.includes("permission"))
    return "permission_missing";
  return "meta_access_error";
}

function addDiagnosticIssue(
  diagnostics: any,
  code: string,
  message: string,
  metaError?: any,
) {
  diagnostics.issue_codes = Array.isArray(diagnostics.issue_codes)
    ? diagnostics.issue_codes
    : [];
  diagnostics.issues = Array.isArray(diagnostics.issues)
    ? diagnostics.issues
    : [];

  if (!diagnostics.issue_codes.includes(code))
    diagnostics.issue_codes.push(code);
  if (!diagnostics.issues.includes(message)) diagnostics.issues.push(message);

  if (code === "token_expired") diagnostics.reconnect_required = true;
  if (metaError)
    diagnostics.meta_errors.push({
      code: metaError.code || null,
      subcode: metaError.error_subcode || null,
      type: metaError.type || null,
      fbtrace_id: metaError.fbtrace_id || null,
    });
}

function getMetaSendErrorMessage(error: any) {
  const code = error?.code;
  const details = error?.error_data?.details || error?.message || "";
  if (code === 131005) {
    return `(#131005) Access denied: selected WhatsApp account token cannot send messages with this phone number. Reconnect the account using a token with whatsapp_business_messaging permission, and make sure the phone number belongs to the same WABA/token. Meta details: ${details}`;
  }
  const parts = [
    error?.message,
    details && details !== error?.message ? details : "",
    error?.error_subcode ? `subcode ${error.error_subcode}` : "",
    error?.fbtrace_id ? `trace ${error.fbtrace_id}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || "API Error";
}

function getMetaErrorMessage(data: any, fallback: string) {
  const error = data?.error || data;
  if (!error) return fallback;
  const parts = [
    error.message,
    error.error_user_msg,
    error.error_data?.details,
    error.error_subcode ? `subcode ${error.error_subcode}` : "",
    error.fbtrace_id ? `trace ${error.fbtrace_id}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || fallback;
}

function buildAccountReadinessSummary(account: any) {
  const isMeta = Boolean(
    account?.whatsapp_business_account_id || account?.access_token_encrypted,
  );
  if (!isMeta) {
    return {
      connection_type: "qr_session",
      send_ready:
        account?.status === "connected" || account?.status === "active",
      diagnostics_summary:
        account?.status === "connected" || account?.status === "active"
          ? "QR testing session connected."
          : "QR testing session is not connected.",
    };
  }

  const issues = [];
  if (!account?.phone_number_id) issues.push("Missing phone number ID");
  if (!account?.whatsapp_business_account_id) issues.push("Missing WABA ID");
  if (!account?.access_token_encrypted)
    issues.push("Missing Meta access token");
  if (account?.status === "disconnected") issues.push("Account disconnected");

  return {
    connection_type: "meta_cloud_api",
    send_ready: issues.length === 0,
    diagnostics_summary:
      issues.length === 0
        ? "Cloud API account has required saved credentials. Run diagnostics for live Meta permission check."
        : issues.join(", "),
  };
}

function toSafeWhatsappAccount(account: any) {
  if (!account) return account;
  const { access_token_encrypted, ...safe } = account;
  return {
    ...safe,
    ...buildAccountReadinessSummary(account),
  };
}

async function getMetaAccountDiagnostics(account: any) {
  const token = account?.access_token_encrypted
    ? decryptToken(account.access_token_encrypted)
    : "";
  const diagnostics: any = {
    account_id: account?.id || null,
    phone_number_id: account?.phone_number_id || null,
    whatsapp_business_account_id: account?.whatsapp_business_account_id || null,
    has_access_token: !!token,
    token_permissions: null,
    phone_number_access: null,
    waba_access: null,
    issue_codes: [],
    reconnect_required: false,
    meta_errors: [],
    send_ready: false,
    issues: [],
  };

  if (!token) {
    addDiagnosticIssue(
      diagnostics,
      "token_missing",
      "Missing Meta access token. Reconnect this account.",
    );
    return diagnostics;
  }

  diagnostics.token_permissions = await inspectMetaTokenPermissions(token);
  if (diagnostics.token_permissions?.is_valid === false) {
    addDiagnosticIssue(
      diagnostics,
      "token_expired",
      "Meta access token expired. Reconnect this WhatsApp number from Connect with Meta to restore sending, templates, and profile access.",
    );
  }
  if (diagnostics.token_permissions?.missingScopes?.length) {
    addDiagnosticIssue(
      diagnostics,
      "permission_missing",
      `Token missing permission(s): ${diagnostics.token_permissions.missingScopes.join(", ")}`,
    );
  }

  if (account?.phone_number_id) {
    try {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v21.0/${account.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status&access_token=${encodeURIComponent(token)}`,
      );
      const phoneJson: any = await phoneRes.json();
      diagnostics.phone_number_access = phoneJson;
      if (!phoneRes.ok || phoneJson.error) {
        const issueCode = getMetaIssueCode(phoneJson.error);
        addDiagnosticIssue(
          diagnostics,
          issueCode === "token_expired" ? issueCode : "phone_access_denied",
          issueCode === "token_expired"
            ? "Meta access token expired. Reconnect this WhatsApp number from Connect with Meta to restore sending, templates, and profile access."
            : `Token cannot access phone number ${account.phone_number_id}: ${phoneJson.error?.message || "Unknown Meta error"}`,
          phoneJson.error,
        );
      }
    } catch (err: any) {
      addDiagnosticIssue(
        diagnostics,
        "phone_access_check_failed",
        `Could not validate phone number access: ${err.message}`,
      );
    }
  } else {
    addDiagnosticIssue(
      diagnostics,
      "phone_number_missing",
      "Missing phone_number_id on this account.",
    );
  }

  if (account?.whatsapp_business_account_id) {
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v21.0/${account.whatsapp_business_account_id}/phone_numbers?access_token=${encodeURIComponent(token)}`,
      );
      const wabaJson: any = await wabaRes.json();
      diagnostics.waba_access = wabaJson;
      if (!wabaRes.ok || wabaJson.error) {
        const issueCode = getMetaIssueCode(wabaJson.error);
        addDiagnosticIssue(
          diagnostics,
          issueCode === "token_expired" ? issueCode : "waba_access_denied",
          issueCode === "token_expired"
            ? "Meta access token expired. Reconnect this WhatsApp number from Connect with Meta to restore sending, templates, and profile access."
            : `Token cannot access WABA ${account.whatsapp_business_account_id}: ${wabaJson.error?.message || "Unknown Meta error"}`,
          wabaJson.error,
        );
      } else if (
        account?.phone_number_id &&
        !wabaJson.data?.some(
          (phone: any) => String(phone.id) === String(account.phone_number_id),
        )
      ) {
        addDiagnosticIssue(
          diagnostics,
          "phone_not_in_waba",
          `Phone number ${account.phone_number_id} was not found inside WABA ${account.whatsapp_business_account_id} for this token.`,
        );
      }
    } catch (err: any) {
      addDiagnosticIssue(
        diagnostics,
        "waba_access_check_failed",
        `Could not validate WABA phone list: ${err.message}`,
      );
    }
  } else {
    addDiagnosticIssue(
      diagnostics,
      "waba_missing",
      "Missing whatsapp_business_account_id on this account.",
    );
  }

  diagnostics.send_ready = diagnostics.issues.length === 0;
  return diagnostics;
}

async function getOrgWhatsappAccount(accountId: string, orgId: string) {
  const { data: account, error } = await supabase
    .from("w_wa_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) throw error;
  return account;
}

async function fetchMetaBusinessProfile(account: any) {
  const token = account?.access_token_encrypted
    ? decryptToken(account.access_token_encrypted)
    : "";
  if (!account?.phone_number_id || !token)
    throw new Error(
      "Selected account is missing phone number ID or access token",
    );

  const fields =
    "about,address,description,email,profile_picture_url,websites,vertical";
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phone_number_id}/whatsapp_business_profile?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  const json: any = await response.json();
  if (!response.ok || json.error)
    throw new Error(
      json.error?.message || "Failed to fetch WhatsApp business profile",
    );

  return Array.isArray(json.data) ? json.data[0] || {} : json;
}

function formatMetaApiError(error: any, fallback: string) {
  if (!error) return fallback;
  const parts = [
    error.message,
    error.error_user_msg,
    error.error_data?.details,
    error.code ? `code ${error.code}` : "",
    error.error_subcode ? `subcode ${error.error_subcode}` : "",
    error.fbtrace_id ? `trace ${error.fbtrace_id}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" | ") : fallback;
}

async function updateMetaBusinessProfile(
  account: any,
  body: any,
  profilePictureHandle?: string | null,
) {
  const token = account?.access_token_encrypted
    ? decryptToken(account.access_token_encrypted)
    : "";
  if (!account?.phone_number_id || !token)
    throw new Error(
      "Selected account is missing phone number ID or access token",
    );

  const payload: any = {
    messaging_product: "whatsapp",
  };

  for (const key of ["about", "address", "description", "email", "vertical"]) {
    if (Object.prototype.hasOwnProperty.call(body, key))
      payload[key] = String(body[key] || "");
  }

  if (Object.prototype.hasOwnProperty.call(body, "websites")) {
    const raw = body.websites;
    payload.websites = Array.isArray(raw)
      ? raw.filter(Boolean)
      : String(raw || "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
  }

  if (profilePictureHandle)
    payload.profile_picture_handle = profilePictureHandle;

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phone_number_id}/whatsapp_business_profile`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const json: any = await response.json();
  if (!response.ok || json.error)
    throw new Error(
      formatMetaApiError(
        json.error,
        "Failed to update WhatsApp business profile",
      ),
    );
  return json;
}

async function uploadMetaProfilePicture(
  file: Express.Multer.File,
  token: string,
) {
  const appId = process.env.META_APP_ID;
  if (!appId)
    throw new Error("META_APP_ID is required to upload a profile picture");
  if (!file?.buffer?.length)
    throw new Error("Profile picture file is required");
  if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
    throw new Error(
      "Profile picture must be a JPG or PNG image. WEBP is not accepted by Meta for WhatsApp profile pictures.",
    );
  }

  const createUrl = new URL(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/uploads`,
  );
  createUrl.searchParams.set("file_name", file.originalname || "profile.jpg");
  createUrl.searchParams.set("file_length", String(file.buffer.length));
  createUrl.searchParams.set("file_type", file.mimetype || "image/jpeg");
  createUrl.searchParams.set("access_token", token);

  const createRes = await fetch(createUrl, { method: "POST" });
  const createJson: any = await createRes.json();
  if (!createRes.ok || createJson.error || !createJson.id) {
    throw new Error(
      formatMetaApiError(
        createJson.error,
        "Failed to create Meta upload session",
      ),
    );
  }

  const uploadRes = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${createJson.id}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": file.mimetype || "application/octet-stream",
      },
      body: file.buffer as any,
    },
  );
  const uploadJson: any = await uploadRes.json();
  if (!uploadRes.ok || uploadJson.error || !uploadJson.h) {
    throw new Error(
      formatMetaApiError(
        uploadJson.error,
        "Failed to upload profile picture to Meta",
      ),
    );
  }

  return uploadJson.h;
}

// ====== Active Subscription Verification helper ======
async function checkSubscription(orgId: string): Promise<boolean> {
  if (!supabase) return true; // Debug mode fallback
  try {
    const { data: ownerMember, error: ownerErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("role", "owner")
      .maybeSingle();

    if (ownerErr || !ownerMember) {
      console.warn(`[Subscription Check] No owner found for org ${orgId}`);
      return false;
    }

    const { data: sub, error: subErr } = await supabase
      .from("app_user_subscriptions")
      .select("plan_id, expires_at")
      .eq("user_id", ownerMember.user_id)
      .maybeSingle();

    if (subErr || !sub) {
      console.warn(
        `[Subscription Check] No subscription found for user ${ownerMember.user_id}`,
      );
      return false;
    }

    const expiresAt = sub.expires_at ? new Date(sub.expires_at).getTime() : 0;
    const isActive = expiresAt > Date.now();
    if (!isActive) return false;

    const plan = String(sub.plan_id || "").toLowerCase();
    const isWhatsAppPlan =
      plan.includes("whatsapp") ||
      plan.includes("all_in_one") ||
      plan.includes("bundle") ||
      plan.includes("ultimate") ||
      plan.includes("starter") ||
      plan.includes("growth") ||
      plan.includes("pro");
    return isWhatsAppPlan;
  } catch (err: any) {
    console.error(
      `[Subscription Check] Error checking subscription for org ${orgId}:`,
      err.message,
    );
    return false;
  }
}

// ====== Auth Middleware (Supabase JWT) ======
async function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token)
    return res.status(401).json({ error: "Unauthorized - missing token" });

  if (!supabase)
    return res
      .status(503)
      .json({ error: "Service unavailable - Supabase not configured" });

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error("Supabase Auth Error:", error?.message || error);
      return res
        .status(401)
        .json({ error: "Unauthorized - invalid or expired token" });
    }

    req.user = user;

    // Fetch member role and org
    const { data: member } = await supabase
      .from("organization_members")
      .select("role, organization_id, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    // Resolve role and portal context

    const portal = req.headers["x-auth-portal"] || "owner";
    const dbRole = member?.role;

    if (portal === "agent") {
      if (!member) {
        return res
          .status(403)
          .json({ error: "Forbidden - Agent profile was not found" });
      }
      if (dbRole !== "agent") {
        return res
          .status(403)
          .json({
            error: "Forbidden - This login page is only for team agents",
          });
      }
      if (member.is_active === false) {
        return res
          .status(403)
          .json({
            error: "Forbidden - Agent invitation is pending or expired",
          });
      }
      req.role = "agent";
    } else {
      req.role = dbRole || "owner";
    }

    let orgId =
      member?.organization_id || user.user_metadata?.organization_id || null;

    // AUTO-PROVISION: If no orgId found and user is an owner (or logging into owner portal)
    if (!orgId && req.role !== "agent") {
      console.log(`[Auth] Auto-provisioning organization for: ${user.email}`);
      try {
        // Re-check for race condition
        const { data: checkAgain } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (checkAgain?.organization_id) {
          orgId = checkAgain.organization_id;
        } else {
          // 1. Create Organization
          const orgName = `${user.email.split("@")[0]}'s Workspace`;
          const slug = orgName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          const { data: newOrg, error: orgErr } = await supabase
            .from("organizations")
            .insert({
              name: orgName,
              slug: slug,
              plan_id: "starter",
              plan_status: "trial",
              is_active: true,
            })
            .select()
            .single();

          if (orgErr) throw orgErr;

          // 2. Create Member
          const { error: memberErr } = await supabase
            .from("organization_members")
            .insert({
              user_id: user.id,
              organization_id: newOrg.id,
              role: "owner",
              name: user.user_metadata?.full_name || user.email.split("@")[0],
              email: user.email,
            });

          if (memberErr) throw memberErr;

          // 3. Update User Metadata (Optional but helps)
          await supabase.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              organization_id: newOrg.id,
            },
          });

          orgId = newOrg.id;
          console.log(
            `[Auth] Successfully provisioned org ${orgId} for ${user.email}`,
          );
        }
      } catch (err: any) {
        console.error(
          `[Auth] Provisioning failed for ${user.email}:`,
          err.message,
        );
        // Continue, might still fail 403 below
      }
    }

    if (!orgId) {
      console.warn(
        `⚠️ User ${user.email} (${user.id}) has no organization_id.`,
      );
      return res
        .status(403)
        .json({
          error: "Forbidden - User does not belong to any organization",
        });
    }

    req.organization_id = orgId;

    // Enforce active subscription check
    const bypassPaths = ["/api/team/my-profile", "/api/wa/logout"];
    if (!bypassPaths.includes(req.path)) {
      const hasSub = await checkSubscription(orgId);
      if (!hasSub) {
        return res
          .status(403)
          .json({
            error:
              "Subscription expired or plan does not include GAP WhatsApp access. Please upgrade.",
          });
      }
    }

    next();
  } catch (err: any) {
    console.error("Auth Middleware Exception:", err.message);
    return res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
}

function decodeSupabaseJwtRole(
  token: string | null | undefined,
): string | null {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length < 2) return null;
  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad) payload += "=".repeat(4 - pad);
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const json = JSON.parse(decoded);
    return json?.role || null;
  } catch {
    return null;
  }
}

const SUPABASE_KEY_ROLE = decodeSupabaseJwtRole(SUPABASE_SERVICE_ROLE_KEY);
const INVITE_TTL_HOURS = Number(process.env.TEAM_INVITE_TTL_HOURS || 24);

app.get("/api/billing/overview", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  const userId = req.user?.id;
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  const fallbackRateCards = Object.values(DEFAULT_WHATSAPP_RATE_CARD).map(
    (rate) => ({
      market: DEFAULT_BILLING_MARKET,
      currency: DEFAULT_BILLING_CURRENCY,
      category: rate.category,
      label: rate.label,
      rate_paise: rate.rate_paise,
      pass_through_rate_paise: rate.rate_paise,
      markup_paise: 0,
      description: rate.description,
      notes:
        "Fallback rate. Run the billing migration to manage rates from Supabase.",
    }),
  );

  try {
    if (!orgId)
      return res.status(400).json({ error: "organization_id is required" });

    const [
      orgResult,
      plansResult,
      walletResult,
      rateCardsResult,
      monthUsageResult,
      todayUsageResult,
      walletTransactionsResult,
      messageDebitTransactionsResult,
      messageChargesResult,
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id, name, plan_id, plan_status, plan_start_date, plan_end_date, billing_cycle, max_users, max_contacts",
        )
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("whatsapp_subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("whatsapp_wallets")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("whatsapp_rate_cards")
        .select(
          "market, currency, category, rate_paise, pass_through_rate_paise, markup_paise, notes, effective_from",
        )
        .eq("market", DEFAULT_BILLING_MARKET)
        .eq("currency", DEFAULT_BILLING_CURRENCY)
        .eq("is_active", true)
        .order("effective_from", { ascending: false }),
      supabase
        .from("whatsapp_message_usage_logs")
        .select(
          "category, charged_amount_paise, meta_cost_paise, billable, billing_status",
        )
        .eq("organization_id", orgId)
        .gte("created_at", monthStart),
      supabase
        .from("whatsapp_message_usage_logs")
        .select("category, charged_amount_paise")
        .eq("organization_id", orgId)
        .gte("created_at", todayStart),
      supabase
        .from("whatsapp_wallet_transactions")
        .select(
          "id, type, amount_paise, balance_after_paise, currency, status, description, reference_type, reference_id, created_at",
        )
        .eq("organization_id", orgId)
        .filter("type", "not.in", '("message_debit","failed_debit")')
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("whatsapp_wallet_transactions")
        .select(
          "id, type, amount_paise, balance_after_paise, currency, status, description, reference_type, reference_id, created_at, metadata",
        )
        .eq("organization_id", orgId)
        .filter("type", "in", '("message_debit","failed_debit")')
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("whatsapp_message_usage_logs")
        .select(
          "id, source, category, template_name, campaign_id, wa_message_id, charged_amount_paise, billing_status, delivery_status, created_at",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    let walletData = walletResult.data;
    if (!walletData && !walletResult.error && userId) {
      const { data: createdWallet, error: createWalletError } = await supabase
        .from("whatsapp_wallets")
        .insert({ organization_id: orgId, currency: DEFAULT_BILLING_CURRENCY })
        .select()
        .maybeSingle();
      if (!createWalletError && createdWallet) walletData = createdWallet;
    }

    const plans = plansResult.error ? [] : plansResult.data || [];
    const rateCardsFromDb = rateCardsResult.error
      ? fallbackRateCards
      : (rateCardsResult.data || []).reduce((acc: any[], row: any) => {
          if (!acc.some((item) => item.category === row.category)) {
            acc.push({
              ...row,
              label:
                DEFAULT_WHATSAPP_RATE_CARD[row.category]?.label || row.category,
              description:
                DEFAULT_WHATSAPP_RATE_CARD[row.category]?.description || "",
            });
          }
          return acc;
        }, []);

    const rateCards = rateCardsFromDb.length
      ? rateCardsFromDb
      : fallbackRateCards;
    const monthUsageRows = monthUsageResult.error
      ? []
      : monthUsageResult.data || [];
    const todayUsageRows = todayUsageResult.error
      ? []
      : todayUsageResult.data || [];

    const emptyCategoryStats = Object.keys(DEFAULT_WHATSAPP_RATE_CARD).reduce(
      (acc: any, category) => {
        acc[category] = {
          category,
          label: DEFAULT_WHATSAPP_RATE_CARD[category].label,
          message_count: 0,
          charged_amount_paise: 0,
          meta_cost_paise: 0,
        };
        return acc;
      },
      {},
    );

    const categoryStats = monthUsageRows.reduce((acc: any, row: any) => {
      const category = row.category || "service";
      if (!acc[category]) {
        acc[category] = {
          category,
          label: DEFAULT_WHATSAPP_RATE_CARD[category]?.label || category,
          message_count: 0,
          charged_amount_paise: 0,
          meta_cost_paise: 0,
        };
      }
      acc[category].message_count += 1;
      acc[category].charged_amount_paise += Number(
        row.charged_amount_paise || 0,
      );
      acc[category].meta_cost_paise += Number(row.meta_cost_paise || 0);
      return acc;
    }, emptyCategoryStats);

    const monthSpendPaise = Object.values(categoryStats).reduce(
      (sum: number, item: any) => sum + Number(item.charged_amount_paise || 0),
      0,
    );
    const todaySpendPaise = todayUsageRows.reduce(
      (sum: number, row: any) => sum + Number(row.charged_amount_paise || 0),
      0,
    );
    const walletTransactions = walletTransactionsResult.error
      ? []
      : walletTransactionsResult.data || [];
    const usageLogCharges = messageChargesResult.error
      ? []
      : messageChargesResult.data || [];
    const legacyMessageDebitCharges = messageDebitTransactionsResult.error
      ? []
      : (messageDebitTransactionsResult.data || []).map((tx: any) => ({
          id: tx.id,
          source: tx.reference_type || "message",
          category: tx.metadata?.category || null,
          template_name: tx.metadata?.template_name || null,
          campaign_id:
            tx.metadata?.campaign_id ||
            (tx.reference_type === "broadcast" ? tx.reference_id : null),
          wa_message_id: tx.reference_id || null,
          charged_amount_paise: Math.abs(Number(tx.amount_paise || 0)),
          billing_status: tx.status === "completed" ? "charged" : tx.status,
          delivery_status: null,
          created_at: tx.created_at,
        }));
    const messageCharges = usageLogCharges.length
      ? usageLogCharges
      : legacyMessageDebitCharges;

    const orgData = orgResult.data
      ? { ...orgResult.data }
      : { id: orgId, plan_id: null, plan_status: "inactive" };
    try {
      if (orgResult.data) {
        const { data: ownerMember } = await supabase
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", orgId)
          .eq("role", "owner")
          .maybeSingle();

        if (ownerMember?.user_id) {
          const { data: sub } = await supabase
            .from("app_user_subscriptions")
            .select("started_at, expires_at")
            .eq("user_id", ownerMember.user_id)
            .maybeSingle();

          if (sub) {
            if (!orgData.plan_start_date)
              orgData.plan_start_date = sub.started_at;
            if (!orgData.plan_end_date) orgData.plan_end_date = sub.expires_at;
          }
        }
      }
    } catch (subErr) {
      console.error(
        "[billing/overview] Failed to fetch owner subscription dates:",
        subErr,
      );
    }

    const planId = orgData.plan_id || null;
    const currentPlan = planId
      ? plans.find((plan: any) => plan.id === planId) || null
      : null;

    res.json({
      organization: orgData,
      current_plan: currentPlan,
      plans,
      wallet: walletData || {
        organization_id: orgId,
        balance_paise: 0,
        currency: DEFAULT_BILLING_CURRENCY,
        low_balance_threshold_paise: 10000,
      },
      spend: {
        month_start: monthStart,
        today_start: todayStart,
        month_spend_paise: monthSpendPaise,
        today_spend_paise: todaySpendPaise,
        categories: Object.values(categoryStats),
      },
      rate_cards: rateCards,
      recent_transactions: walletTransactions,
      recent_wallet_transactions: walletTransactions,
      recent_message_charges: messageCharges,
      warnings: {
        plans_table_missing: !!plansResult.error,
        wallet_table_missing: !!walletResult.error,
        usage_table_missing: !!monthUsageResult.error,
        rate_card_table_missing: !!rateCardsResult.error,
      },
    });
  } catch (err: any) {
    console.error("[billing/overview] Error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to load billing overview" });
  }
});

console.log("Checking Env:", {
  SUPABASE_URL_PRESENT: !!SUPABASE_URL,
  KEY_PRESENT: !!SUPABASE_SERVICE_ROLE_KEY,
  KEY_ROLE: SUPABASE_KEY_ROLE || "unknown",
  VERIFY_TOKEN: !!process.env.WA_VERIFY_TOKEN,
  URL_VALUE_START: SUPABASE_URL ? SUPABASE_URL.substring(0, 10) : "N/A",
});

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isAllZeroUuid(value: string) {
  return String(value).toLowerCase() === "00000000-0000-0000-0000-000000000000";
}

function cleanText(value: any, maxLength = 500) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function cleanNullableText(value: any, maxLength = 500) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ====== Global / Shared Constants ======
const DEFAULT_ORG_ID = null;
let resolvedOrgId: string | null = null;

async function ensureDefaultOrganizationId(): Promise<string | null> {
  return null;
}

function normalizeWaIdToPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value);
  const left = raw.includes("@") ? raw.split("@")[0] : raw;
  const digits = left.replace(/\D+/g, "");
  return digits.length >= 8 ? digits : null;
}

function normalizeIndianPhoneKey(
  value: string | null | undefined,
): string | null {
  const digits = normalizeWaIdToPhone(value);
  if (!digits) return null;

  // Accept:
  // - local 10-digit numbers => prefix 91
  // - E.164 without plus: 91XXXXXXXXXX (12 digits)
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;

  // We intentionally do NOT try to coerce other lengths.
  // Values like "...@lid" are internal identifiers and not a real phone number.
  return null;
}

function derivePhoneForStorage(
  value: string | null | undefined,
): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Only derive phones for 1:1 identifiers.
  // Reject non-phone domains like @lid, @g.us, @newsletter.
  if (raw.includes("@") && !raw.endsWith("@s.whatsapp.net")) return null;

  const digits = normalizeWaIdToPhone(raw);
  if (!digits) return null;
  // India local numbers (10 digits) => prefix 91
  if (digits.length === 10) return `91${digits}`;
  // Generic E.164-ish digits
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

function normalizeTemplateHeaderMedia(mapping: any, fallbackType?: string) {
  const source = mapping && typeof mapping === "object" ? mapping : {};
  const type = String(
    source._header_media_type || source.header_media_type || fallbackType || "",
  ).toLowerCase();
  const url = String(
    source._header_media_url ||
      source.header_media_url ||
      source.headerImageUrl ||
      source.header_image_url ||
      source.headerUrl ||
      "",
  ).trim();

  return { type, url };
}

function normalizeDynamicUrlButtonValue(templateUrl: string, value: any) {
  let cleanValue = String(value || "").trim();
  const cleanTemplateUrl = String(templateUrl || "");
  const placeholderIndex = cleanTemplateUrl.indexOf("{{");
  const staticPrefix =
    placeholderIndex >= 0 ? cleanTemplateUrl.slice(0, placeholderIndex) : "";

  if (staticPrefix && cleanValue.startsWith(staticPrefix)) {
    cleanValue = cleanValue.slice(staticPrefix.length);
  }

  if (staticPrefix.endsWith("/") && cleanValue.startsWith("/")) {
    cleanValue = cleanValue.slice(1);
  }

  return cleanValue;
}

function validateDynamicUrlButtonValue(templateUrl: string, value: any) {
  const rawValue = String(value || "").trim();
  const cleanTemplateUrl = String(templateUrl || "");
  const placeholderIndex = cleanTemplateUrl.indexOf("{{");
  const staticPrefix =
    placeholderIndex >= 0 ? cleanTemplateUrl.slice(0, placeholderIndex) : "";
  const normalizedValue = normalizeDynamicUrlButtonValue(templateUrl, rawValue);
  const isAbsoluteUrl = /^https?:\/\//i.test(rawValue);

  if (staticPrefix && isAbsoluteUrl && !rawValue.startsWith(staticPrefix)) {
    return {
      ok: false,
      value: normalizedValue,
      error: `URL button is approved for ${staticPrefix}... Enter only the placeholder part for that approved URL, or create a new Meta template for this different domain.`,
    };
  }

  if (staticPrefix && /^https?:\/\//i.test(normalizedValue)) {
    return {
      ok: false,
      value: normalizedValue,
      error: "URL button needs only the placeholder value, not a full URL.",
    };
  }

  return {
    ok: !!normalizedValue,
    value: normalizedValue,
    error: "URL button placeholder value is required.",
  };
}

function resolveTemplateButtonUrl(templateUrl: string, value: any) {
  const cleanTemplateUrl = String(templateUrl || "").trim();
  if (!cleanTemplateUrl) return "";

  const cleanValue = normalizeDynamicUrlButtonValue(cleanTemplateUrl, value);
  if (!cleanTemplateUrl.includes("{{")) return cleanTemplateUrl;

  return cleanTemplateUrl.replace(/\{\{\s*\d+\s*\}\}/g, cleanValue);
}

function formatIndianPhoneForDisplay(value: string | null | undefined): string {
  const key = normalizeIndianPhoneKey(value);
  if (!key) {
    const digits = normalizeWaIdToPhone(value);
    return digits ? digits : "";
  }
  return `+${key}`;
}

function toProfilePhotoJid(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes("@g.us") || raw.includes("@newsletter")) return null;
  if (raw.includes("@s.whatsapp.net")) return raw;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `${digits}@s.whatsapp.net`;
}

async function getCachedProfilePhotoUrl(waId: string | null | undefined) {
  const jid = toProfilePhotoJid(waId);
  if (!jid) return null;

  const cached = profilePhotoCache.get(jid);
  if (cached && Date.now() - cached.fetchedAt < PROFILE_PHOTO_TTL_MS)
    return cached.url;

  let attempted = false;
  for (const sock of sessions.values()) {
    try {
      if (!sock?.user?.id || typeof sock.profilePictureUrl !== "function")
        continue;
      attempted = true;
      let url: string | null = null;
      try {
        url = await sock.profilePictureUrl(jid, "image");
      } catch {
        url = await sock.profilePictureUrl(jid, "preview");
      }
      profilePhotoCache.set(jid, { url: url || null, fetchedAt: Date.now() });
      return url || null;
    } catch {
      // WhatsApp privacy settings or missing profile photos commonly land here.
    }
  }

  if (attempted)
    profilePhotoCache.set(jid, { url: null, fetchedAt: Date.now() });
  return null;
}

function sanitizeContactDisplayName(
  name: string | null | undefined,
  waId: string,
): string | null {
  const raw = String(name || "").trim();
  if (!raw) return null;

  // Reject digit-only values; those are not a real display name.
  if (/^\d+$/.test(raw)) return null;

  // Never persist provider identifiers as a "name".
  // Examples: 886...@s.whatsapp.net, 886...@lid
  if (raw.includes("@")) return null;

  const waLeft = String(waId || "").split("@")[0];
  if (!waLeft) return raw;
  if (raw === waId || raw === waLeft) return null;

  return raw;
}

function isInvalidStoredContactName(name: any, waId: string): boolean {
  const raw = String(name || "").trim();
  if (!raw) return true;
  if (raw.includes("@")) return true;
  if (/^\d+$/.test(raw)) return true;
  const waLeft = String(waId || "").split("@")[0];
  if (waLeft && (raw === waId || raw === waLeft)) return true;
  return false;
}

function normalizeContactWaIdForStorage(
  value: string | null | undefined,
): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // For 1:1 chats we store phone-only to keep ids stable.
  if (raw.endsWith("@s.whatsapp.net")) return raw.split("@")[0];
  return raw;
}

function pickBestBaileysContactName(c: any, waId: string): string | null {
  const candidate =
    (typeof c?.name === "string" && c.name.trim() ? c.name.trim() : null) ||
    (typeof c?.notify === "string" && c.notify.trim()
      ? c.notify.trim()
      : null) ||
    (typeof c?.verifiedName === "string" && c.verifiedName.trim()
      ? c.verifiedName.trim()
      : null) ||
    null;

  return sanitizeContactDisplayName(candidate, waId);
}

function normalizeFilename(name: string) {
  return String(name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function ensureMediaBucket() {
  if (!supabase) return;

  // Creating buckets requires the Supabase "service_role" key.
  // Many people accidentally paste the anon key into SUPABASE_SERVICE_ROLE_KEY,
  // which triggers the RLS error: "new row violates row-level security policy".
  if (SUPABASE_KEY_ROLE && SUPABASE_KEY_ROLE !== "service_role") {
    console.warn(
      `âš ï¸ Supabase Storage bucket auto-create skipped (KEY_ROLE=${SUPABASE_KEY_ROLE}). ` +
        `Fix: set SUPABASE_SERVICE_ROLE_KEY to your project's Service Role key (server-side only), ` +
        `or create the bucket '${MEDIA_BUCKET}' manually in Supabase Dashboard.`,
    );
    return;
  }

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists =
      Array.isArray(buckets) &&
      buckets.some((b: any) => b?.name === MEDIA_BUCKET);
    if (exists) return;
    const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, {
      public: true,
    });
    if (error)
      console.warn("âš ï¸ Failed to create media bucket:", error.message);
    else console.log(`âœ… Created Supabase storage bucket: ${MEDIA_BUCKET}`);
  } catch (err) {
    console.warn("âš ï¸ ensureMediaBucket failed:", err);
  }
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function uploadMediaToStorage(params: {
  organization_id: string;
  conversation_id: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  // Prefer Supabase Storage when available; fall back to local /uploads when bucket/permissions fail.
  const safeName = normalizeFilename(params.fileName);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";

  if (supabase) {
    try {
      const storagePath = `${params.organization_id}/${params.conversation_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, params.buffer, {
          contentType: params.mimeType,
          upsert: false,
        });
      if (!upErr) {
        const { data } = supabase.storage
          .from(MEDIA_BUCKET)
          .getPublicUrl(storagePath);
        if (data?.publicUrl)
          return { path: storagePath, publicUrl: data.publicUrl };
      }
    } catch {
      // fall back to local
    }
  }

  const localName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const diskPath = path.join(UPLOADS_DIR, localName);
  fs.writeFileSync(diskPath, params.buffer);
  return {
    path: `uploads/${localName}`,
    publicUrl: `${PUBLIC_BASE_URL}/uploads/${encodeURIComponent(localName)}`,
  };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function normalizeKnowledgeDocument(doc: any) {
  return {
    id: String(doc?.id || crypto.randomUUID()),
    name: String(doc?.name || "Untitled document"),
    mime_type: String(doc?.mime_type || "application/octet-stream"),
    size: Number(doc?.size || 0),
    size_label: doc?.size_label || formatBytes(Number(doc?.size || 0)),
    status: doc?.status || "INDEXED",
    content: String(doc?.content || "").slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS),
    created_at: doc?.created_at || new Date().toISOString(),
    updated_at: doc?.updated_at || doc?.created_at || new Date().toISOString(),
  };
}

async function getOrganizationSettings(organizationId: string): Promise<any> {
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .single();
  if (error) throw error;
  return data?.settings && typeof data.settings === "object"
    ? data.settings
    : {};
}

async function getKnowledgeDocuments(organizationId: string) {
  const settings = await getOrganizationSettings(organizationId);
  const docs = Array.isArray(settings.knowledge_base_documents)
    ? settings.knowledge_base_documents
    : [];
  return docs.map(normalizeKnowledgeDocument);
}

async function saveKnowledgeDocuments(
  organizationId: string,
  documents: any[],
) {
  const settings = await getOrganizationSettings(organizationId);
  const nextDocuments = documents.map(normalizeKnowledgeDocument);
  const nextSettings = {
    ...settings,
    knowledge_base_documents: nextDocuments,
    knowledge_base_updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", organizationId);
  if (error) throw error;
  return nextDocuments;
}

async function extractKnowledgeText(
  file: Express.Multer.File,
): Promise<string> {
  const mimeType = file.mimetype || "";
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (
    [".txt", ".md", ".csv", ".json"].includes(ext) ||
    mimeType.startsWith("text/") ||
    mimeType === "application/json"
  ) {
    return file.buffer.toString("utf8");
  }

  if (
    ext === ".docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth: any = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result?.value || "";
  }

  if (ext === ".pdf" || mimeType === "application/pdf") {
    const pdfModule: any = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = pdfModule.default || pdfModule;
    const result = await pdfParse(file.buffer);
    return result?.text || "";
  }

  throw new Error(
    "Unsupported file type. Upload PDF, DOCX, TXT, MD, CSV, or JSON.",
  );
}

async function getOrganizationKnowledgeContext(
  organizationId: string,
): Promise<string> {
  try {
    const docs = await getKnowledgeDocuments(organizationId);
    return docs
      .filter((doc: any) => doc.status === "INDEXED" && doc.content)
      .map((doc: any) => `Source: ${doc.name}\n${doc.content}`)
      .join("\n\n")
      .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
  } catch (err: any) {
    console.warn(
      "Failed to load organization knowledge base:",
      err?.message || err,
    );
    return "";
  }
}

const AGENT_SETTINGS_ITEM_TYPE = "__agent_settings";

function getAgentAutomationSettings(agent: any) {
  const content = Array.isArray(agent?.knowledge_base_content)
    ? agent.knowledge_base_content
    : [];
  const item = content.find(
    (entry: any) => entry?.type === AGENT_SETTINGS_ITEM_TYPE,
  );
  const settings =
    item?.settings && typeof item.settings === "object" ? item.settings : {};
  return {
    reply_on_keywords: settings.reply_on_keywords !== false,
    auto_reply_unknown: settings.auto_reply_unknown === true,
    default_for_new_chats: settings.default_for_new_chats === true,
    handoff_on_human_reply: settings.handoff_on_human_reply !== false,
  };
}

function stripAgentMetadataItems(items: any[]) {
  return (Array.isArray(items) ? items : []).filter(
    (entry: any) => entry?.type !== AGENT_SETTINGS_ITEM_TYPE,
  );
}

async function buildAgentKnowledgePayload(organizationId: string, params: any) {
  const docs = await getKnowledgeDocuments(organizationId);
  const selectedIds = Array.isArray(params.selected_knowledge_document_ids)
    ? params.selected_knowledge_document_ids.map((id: any) => String(id))
    : null;
  const selectedDocs = selectedIds
    ? docs.filter((doc: any) => selectedIds.includes(String(doc.id)))
    : docs.filter((doc: any) =>
        (Array.isArray(params.knowledge_base)
          ? params.knowledge_base
          : []
        ).includes(doc.name),
      );

  const uploadedContent = stripAgentMetadataItems(
    params.knowledge_base_content || [],
  );
  const docContent = selectedDocs.map((doc: any) => ({
    id: doc.id,
    name: doc.name,
    size: doc.size,
    size_label: doc.size_label,
    status: doc.status,
    content: doc.content,
    source: "workspace_knowledge_base",
    updated_at: doc.updated_at,
  }));

  const automationSettings = {
    reply_on_keywords: params.automation_settings?.reply_on_keywords !== false,
    auto_reply_unknown: params.automation_settings?.auto_reply_unknown === true,
    default_for_new_chats:
      params.automation_settings?.default_for_new_chats === true,
    handoff_on_human_reply:
      params.automation_settings?.handoff_on_human_reply !== false,
  };

  const knowledgeBaseContent = [
    ...docContent,
    ...uploadedContent,
    {
      type: AGENT_SETTINGS_ITEM_TYPE,
      settings: automationSettings,
      selected_knowledge_document_ids: selectedDocs.map((doc: any) => doc.id),
      trained_at: new Date().toISOString(),
      training: {
        document_count: selectedDocs.length + uploadedContent.length,
        character_count: [...docContent, ...uploadedContent].reduce(
          (sum: number, item: any) => sum + String(item?.content || "").length,
          0,
        ),
      },
    },
  ];

  return {
    knowledge_base: [
      ...selectedDocs.map((doc: any) => doc.name),
      ...uploadedContent.map((item: any) => item?.name).filter(Boolean),
    ],
    knowledge_base_content: knowledgeBaseContent,
  };
}

async function downloadMetaMedia(params: {
  phone_number_id: string;
  mediaId: string;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  if (!supabase) return null;

  const { data: acc } = await supabase
    .from("w_wa_accounts")
    .select("access_token_encrypted")
    .eq("phone_number_id", params.phone_number_id)
    .maybeSingle();

  const rawToken = acc?.access_token_encrypted || ACCESS_TOKEN;
  const token = rawToken ? decryptToken(rawToken) : rawToken;
  if (!token) return null;

  const metaUrl = `https://graph.facebook.com/v21.0/${params.mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) return null;
  const metaJson: any = await metaRes.json();
  const downloadUrl = metaJson?.url;
  const mimeType = metaJson?.mime_type || "application/octet-stream";
  const fileName = metaJson?.filename || `media-${params.mediaId}`;
  if (!downloadUrl) return null;

  const binRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!binRes.ok) return null;
  const arrayBuf = await binRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), mimeType, fileName };
}

async function sendMediaMessageMeta(params: {
  phone_number_id: string;
  to: string;
  token: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  type: "image" | "video" | "audio" | "document";
  caption?: string;
}) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append(
    "file",
    new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }),
    params.fileName,
  );

  const uploadUrl = `https://graph.facebook.com/v21.0/${params.phone_number_id}/media`;
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.token}` },
    body: form as any,
  });
  const upJson: any = await upRes.json().catch(() => ({}));
  if (!upRes.ok || !upJson?.id)
    throw new Error(`Meta media upload failed: ${JSON.stringify(upJson)}`);

  const payload: any = {
    messaging_product: "whatsapp",
    to: params.to,
    type: params.type,
  };
  if (params.type === "image")
    payload.image = {
      id: upJson.id,
      ...(params.caption ? { caption: params.caption } : {}),
    };
  if (params.type === "video")
    payload.video = {
      id: upJson.id,
      ...(params.caption ? { caption: params.caption } : {}),
    };
  if (params.type === "audio") payload.audio = { id: upJson.id };
  if (params.type === "document")
    payload.document = {
      id: upJson.id,
      filename: params.fileName,
      ...(params.caption ? { caption: params.caption } : {}),
    };

  const sendUrl = `https://graph.facebook.com/v21.0/${params.phone_number_id}/messages`;
  const sendRes = await fetch(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const sendJson: any = await sendRes.json().catch(() => ({}));
  if (!sendRes.ok)
    throw new Error(`Meta send media failed: ${JSON.stringify(sendJson)}`);
  return { wa_message_id: sendJson?.messages?.[0]?.id || null, raw: sendJson };
}

async function downloadPublicMediaForSend(
  url: string,
  fallbackType: "image" | "video" | "audio" | "document",
) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Could not download media URL: HTTP ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "";
  const mimeType =
    contentType.split(";")[0] ||
    (fallbackType === "image"
      ? "image/jpeg"
      : fallbackType === "video"
        ? "video/mp4"
        : fallbackType === "audio"
          ? "audio/mpeg"
          : "application/octet-stream");

  let fileName = "flow-media";
  try {
    const parsed = new URL(url);
    const lastSegment = decodeURIComponent(
      parsed.pathname.split("/").filter(Boolean).pop() || "",
    );
    if (lastSegment && lastSegment.includes(".")) fileName = lastSegment;
  } catch {
    // Keep fallback filename.
  }

  const extensionFromMime = mimeType.includes("jpeg")
    ? "jpg"
    : mimeType.includes("png")
      ? "png"
      : mimeType.includes("gif")
        ? "gif"
        : mimeType.includes("webp")
          ? "webp"
          : mimeType.includes("mp4")
            ? "mp4"
            : mimeType.includes("mpeg")
              ? "mp3"
              : mimeType.includes("ogg")
                ? "ogg"
                : mimeType.includes("pdf")
                  ? "pdf"
                  : "";
  if (!fileName.includes(".") && extensionFromMime)
    fileName = `${fileName}.${extensionFromMime}`;

  return { buffer, mimeType, fileName };
}

async function sendFlowMediaMessageMeta(params: {
  phone_number_id: string | null;
  to: string;
  media: NonNullable<FlowEngineResult["media"]>[number];
}) {
  let token = ACCESS_TOKEN;
  let fromId = PHONE_NUMBER_ID;

  if (params.phone_number_id && supabase) {
    const { data } = await supabase
      .from("w_wa_accounts")
      .select("access_token_encrypted")
      .eq("phone_number_id", params.phone_number_id)
      .single();
    if (data?.access_token_encrypted) {
      token = decryptToken(data.access_token_encrypted);
      fromId = params.phone_number_id;
    }
  }

  if (!fromId || !token)
    throw new Error("Missing WA creds for flow media send");

  const downloaded = await downloadPublicMediaForSend(
    params.media.url,
    params.media.type,
  );
  const sent = await sendMediaMessageMeta({
    phone_number_id: fromId,
    to: params.to,
    token,
    buffer: downloaded.buffer,
    mimeType: params.media.mimeType || downloaded.mimeType,
    fileName: params.media.fileName || downloaded.fileName,
    type: params.media.type,
    caption: params.media.caption || undefined,
  });

  return {
    ...sent,
    media_url: params.media.url,
    mime_type: params.media.mimeType || downloaded.mimeType,
    file_name: params.media.fileName || downloaded.fileName,
    size: downloaded.buffer.length,
  };
}

let supabase: any;
try {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log("âŒ MISSING KEYS, SKIPPING SUPABASE (DEBUG MODE)");
  } else {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log("âœ… Supabase client created");
    ensureMediaBucket().catch(() => undefined);
  }
} catch (err) {
  console.log("âŒ Failed to create Supabase client:", err);
  // process.exit(1);
}

function assertEnv() {
  const missing = [
    !VERIFY_TOKEN && "WA_VERIFY_TOKEN",
    !APP_SECRET && "META_APP_SECRET",
    !ACCESS_TOKEN && "WA_ACCESS_TOKEN",
    !PHONE_NUMBER_ID && "WA_PHONE_NUMBER_ID",
    !SUPABASE_URL && "SUPABASE_URL",
    !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missing.length) {
    console.warn("âš ï¸ Missing env:", missing.join(", "));
  }
}
assertEnv();

// ====== Meta Signature Verify ======
function verifyMetaSignature(req: any) {
  const sig = req.get("X-Hub-Signature-256"); // sha256=...
  if (!sig || !APP_SECRET) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ====== Webhook Verify (GET) ======
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ====== Helper: send text message (Meta Cloud API) ======
// ====== Helper: send text message (Meta Cloud API) ======
async function sendTextMessage(
  to: string,
  body: string,
  phone_number_id: string | null = null,
  contextMessageId: string | null = null,
) {
  // If phone_number_id provided, fetch access token from DB
  let token = ACCESS_TOKEN;
  let fromId = PHONE_NUMBER_ID;

  if (phone_number_id && supabase) {
    const { data } = await supabase
      .from("w_wa_accounts")
      .select("access_token_encrypted")
      .eq("phone_number_id", phone_number_id)
      .single();
    if (data?.access_token_encrypted) {
      token = decryptToken(data.access_token_encrypted);
      fromId = phone_number_id;
    }
  }

  if (!fromId || !token) throw new Error("Missing WA creds for send");

  const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };
  if (contextMessageId) {
    payload.context = { message_id: contextMessageId };
  }

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Send failed: ${JSON.stringify(data)}`);
  }
  return data;
}

async function sendReactionMessage(
  to: string,
  targetMessageId: string,
  emoji: string | null,
  phone_number_id: string | null = null,
) {
  let token = ACCESS_TOKEN;
  let fromId = PHONE_NUMBER_ID;

  if (phone_number_id && supabase) {
    const { data } = await supabase
      .from("w_wa_accounts")
      .select("access_token_encrypted")
      .eq("phone_number_id", phone_number_id)
      .single();
    if (data?.access_token_encrypted) {
      token = decryptToken(data.access_token_encrypted);
      fromId = phone_number_id;
    }
  }

  if (!fromId || !token) throw new Error("Missing WA creds for reaction");

  const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "reaction",
    reaction: {
      message_id: targetMessageId,
      emoji: emoji || "",
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) {
    throw new Error(
      data?.error?.message || `Reaction failed: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

async function sendInteractiveButtons(
  to: string,
  body: string,
  buttons: any[],
  footer: string = "",
  phone_number_id: string | null = null,
) {
  let token = ACCESS_TOKEN;
  let fromId = PHONE_NUMBER_ID;

  if (phone_number_id && supabase) {
    const { data } = await supabase
      .from("w_wa_accounts")
      .select("access_token_encrypted")
      .eq("phone_number_id", phone_number_id)
      .single();
    if (data?.access_token_encrypted) {
      token = decryptToken(data.access_token_encrypted);
      fromId = phone_number_id;
    }
  }

  if (!fromId || !token) throw new Error("Missing WA creds for send");

  const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: {
            id: b.id,
            title: b.text.substring(0, 20), // WhatsApp limit
          },
        })),
      },
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Interactive send failed: ${JSON.stringify(data)}`);
  }
  return data;
}

// ====== Connect WhatsApp Flow (Embedded Signup) ======
// 1. Start: Returns the URL to pop up
app.get("/api/wa/connect/start", (req, res) => {
  // These should be in your .env
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID; // Created in Meta Dev Dashboard -> WhatsApp -> Configuration
  const redirectUri =
    process.env.META_REDIRECT_URI || "https://wb.getaipilot.in/wa-callback";
  // ^ Note: In local dev, this typically points to frontend, which then calls backend /api/wa/connect/callback
  // Or for simplicity, backend handles it if using server-side redirect.
  // Current user flow: Button click -> Popup.

  // Ideally, frontend SDK triggers the popup.
  // Detailed embedded signup usually involves the Facebook JavaScript SDK on the frontend.
  // If the user wants a simple Redirect flow:
  const scope = "whatsapp_business_management,whatsapp_business_messaging";

  // For Embedded Signup, it's often handled via FB SDK on client, returning a code/token to backend.
  // Assuming Frontend gets the "code" and calls backend to exchange/save.
  res.json({
    appId,
    configId,
    redirectUri,
    scope,
    hostedSignupUrl: buildMetaEmbeddedSignupUrl(),
    sessionInfoVersion: META_EMBEDDED_SESSION_INFO_VERSION,
    version: META_EMBEDDED_SIGNUP_VERSION,
  });
});

// 2. Callback: Exchange code for long-lived token & save
app.post("/api/wa/connect/callback", authMiddleware, async (req: any, res) => {
  const { code, waba_id } = req.body;

  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    // Exchange code for token
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = req.body.redirect_uri || "";
    const targetOrgId = req.organization_id;

    if (!targetOrgId)
      return res
        .status(400)
        .json({ error: "No organization found for this user." });
    if (!appId || !appSecret) {
      return res
        .status(500)
        .json({
          error:
            "Meta app configuration is missing. Set META_APP_ID and META_APP_SECRET.",
        });
    }

    const tokenUrl =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
      `?client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&code=${code}` +
      (redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : "");
    const tokenRes = await fetch(tokenUrl);
    const tokenData: any = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      return res.status(400).json({
        error: getMetaErrorMessage(
          tokenData,
          "Meta could not exchange the signup code. Please retry Connect with Meta.",
        ),
      });
    }

    const shortToken = tokenData.access_token;

    // Exchange for long-lived token (System User approach is best, but for Embedded flow:)
    const longTokenUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    const longRes = await fetch(longTokenUrl);
    const longData: any = await longRes.json();

    const finalToken = longData.access_token || shortToken;
    const insertedAccounts = [];
    const discoveryErrors = [];

    // --- NEW: Automatically Discover WABA IDs ---
    // Instead of requiring 'waba_id' from frontend, we fetch all WABAs a user has access to.
    const wabaDiscoveryUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/assigned_whatsapp_business_accounts?access_token=${encodeURIComponent(finalToken)}`;
    const wabaRes = await fetch(wabaDiscoveryUrl);
    const wabaData: any = await wabaRes.json();

    if (!wabaRes.ok || wabaData.error) {
      return res.status(400).json({
        error: getMetaErrorMessage(
          wabaData,
          "Meta could not list WhatsApp Business Accounts. Make sure the logged-in admin granted WhatsApp permissions.",
        ),
      });
    }

    const discoveredWabaIds =
      Array.isArray(wabaData.data) && wabaData.data.length
        ? wabaData.data
        : waba_id
          ? [{ id: waba_id }]
          : [];

    if (discoveredWabaIds.length === 0) {
      return res.status(400).json({
        error:
          "No WhatsApp Business Account was found. Select/create a WABA during Meta onboarding, add a phone number, then try again.",
      });
    }

    // Process each discovered WABA
    for (const waba of discoveredWabaIds) {
      const currentWabaId = waba.id;

      // Fetch Phone Numbers for this specific WABA
      const numbersUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${currentWabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status&access_token=${encodeURIComponent(finalToken)}`;
      const numRes = await fetch(numbersUrl);
      const numData: any = await numRes.json();

      if (!numRes.ok || numData.error) {
        discoveryErrors.push(
          getMetaErrorMessage(
            numData,
            `Could not fetch phone numbers for WABA ${currentWabaId}`,
          ),
        );
        continue;
      }

      if (numData.data?.length) {
        for (const item of numData.data) {
          const phone_number_id = item.id;
          const display_phone_number = item.display_phone_number;

          await enforceWhatsAppCloudNumberLimit(targetOrgId, phone_number_id);

          // Insert or Update in wa_accounts
          const { data, error } = await supabase
            .from("w_wa_accounts")
            .upsert(
              {
                organization_id: targetOrgId,
                whatsapp_business_account_id: currentWabaId,
                phone_number_id,
                display_phone_number,
                name:
                  item.verified_name ||
                  display_phone_number ||
                  "WhatsApp Business",
                access_token_encrypted: encryptToken(finalToken),
                status: "connected",
              },
              { onConflict: "phone_number_id" },
            )
            .select();

          if (error) {
            console.error(`DB Save Error for phone ${phone_number_id}:`, error);
            discoveryErrors.push(
              `Could not save phone ${display_phone_number || phone_number_id}: ${error.message}`,
            );
          } else if (data && data[0]) {
            const diagnostics = await getMetaAccountDiagnostics(data[0]);
            insertedAccounts.push({
              ...toSafeWhatsappAccount(data[0]),
              ...buildAccountReadinessSummary(data[0]),
              send_ready: diagnostics.send_ready,
              diagnostics_summary: diagnostics.send_ready
                ? "Cloud API send access verified."
                : diagnostics.issues.join(", "),
              diagnostics,
            });
          }
        }
      } else {
        discoveryErrors.push(
          `No phone numbers found in WABA ${currentWabaId}. Add/verify a dedicated number in Meta onboarding first.`,
        );
      }
    }

    if (insertedAccounts.length === 0) {
      return res.status(400).json({
        error:
          discoveryErrors[0] ||
          "No WhatsApp phone number could be connected. Add a dedicated number and complete OTP verification in Meta.",
        details: discoveryErrors,
      });
    }

    res.json({
      success: true,
      accounts: insertedAccounts,
      warnings: discoveryErrors,
    });
  } catch (e: any) {
    console.error("Connect Error:", e.message);
    res.status(e.statusCode || 500).json({ error: e.message, limit: e.limit });
  }
});

// 3. Logout: Clear session files and close connection
app.post("/api/wa/logout", async (req, res) => {
  const { sessionId, phone_number_id } = req.body;
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  try {
    console.log(`Logout requested for session ${sessionId}`);
    const sock = sessions.get(sessionId);
    if (sock) {
      try {
        // sock.logout() sends a message to WhatsApp to invalidate the session
        // We also need to end the socket connection
        await sock.logout();
        sock.end(undefined);
      } catch (e) {
        console.error("Baileys logout error:", e);
      }
      sessions.delete(sessionId);
    }

    // Clean up session directory
    const sessionDir = `baileys_auth_info/${sessionId}`;
    if (fs.existsSync(sessionDir)) {
      // Using a small delay to ensure file handles are released by the OS
      setTimeout(() => {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`âœ… Session directory ${sessionId} cleared.`);
        } catch (e) {
          console.error(`Failed to clear directory ${sessionId}:`, e);
        }
      }, 500);
    }

    // Clear all session states
    initializingSessions.delete(sessionId);
    latestQrBySession.delete(sessionId);
    reconnectAttempts.delete(sessionId);

    // Update DB if phone_number_id provided
    if (phone_number_id && supabase) {
      await supabase
        .from("w_wa_accounts")
        .update({ status: "disconnected" })
        .eq("phone_number_id", phone_number_id);
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (e: any) {
    console.error("Logout error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ====== Helper: upsert contact ======
async function upsertContact(
  organization_id: string,
  wa_account_id: string,
  wa_id: string,
  name?: string | null,
) {
  const wa_key = normalizeIndianPhoneKey(wa_id);
  const safeName = sanitizeContactDisplayName(name, wa_id);

  // Determine contact type based on JID
  const isGroup = String(wa_id || "").includes("@g.us");
  const isChannel = String(wa_id || "").includes("@newsletter");
  const contact_type = isGroup ? "group" : isChannel ? "channel" : "individual";

  // Prefer matching by canonical phone key when available.
  let candidates: any[] = [];
  if (wa_key) {
    const { data, error } = await supabase
      .from("w_contacts")
      .select(
        "id,name,custom_name,phone,wa_id,wa_key,created_at,custom_fields,saved_at,saved_by_user_id,save_source",
      )
      .eq("organization_id", organization_id)
      .eq("wa_key", wa_key);
    if (error) throw error;
    candidates = Array.isArray(data) ? data : [];
  }

  if (!candidates.length) {
    const { data, error } = await supabase
      .from("w_contacts")
      .select(
        "id,name,custom_name,phone,wa_id,wa_key,created_at,custom_fields,saved_at,saved_by_user_id,save_source",
      )
      .eq("organization_id", organization_id)
      .eq("wa_id", wa_id)
      .limit(10);
    if (error) throw error;
    candidates = Array.isArray(data) ? data : [];
  }

  const pickBest = (rows: any[]) => {
    const scored = (rows || []).map((r) => {
      const score =
        (r?.custom_name ? 100 : 0) + (r?.name ? 10 : 0) + (r?.phone ? 1 : 0);
      const createdAt = r?.created_at
        ? new Date(r.created_at).getTime()
        : Number.POSITIVE_INFINITY;
      return { r, score, createdAt };
    });
    scored.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
    return scored[0]?.r || null;
  };

  const existing = pickBest(candidates);
  const nowIso = new Date().toISOString();

  const maybePhone = wa_key ? wa_key : derivePhoneForStorage(wa_id);
  const profilePhotoUrl = await getCachedProfilePhotoUrl(maybePhone || wa_id);

  if (existing?.id) {
    const updates: any = {
      last_active: nowIso,
    };

    if (wa_key && !existing.wa_key) updates.wa_key = wa_key;
    if (!existing.phone && maybePhone) updates.phone = maybePhone;
    if (safeName && isInvalidStoredContactName(existing.name, wa_id))
      updates.name = safeName;
    if (profilePhotoUrl) {
      updates.custom_fields = {
        ...(existing.custom_fields && typeof existing.custom_fields === "object"
          ? existing.custom_fields
          : {}),
        profile_photo_url: profilePhotoUrl,
        profile_photo_checked_at: nowIso,
      };
    }

    const { data: updated, error: updErr } = await supabase
      .from("w_contacts")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();
    if (updErr) throw updErr;

    // If we learned a real name/phone, propagate it to any duplicates sharing wa_key.
    if (wa_key && (safeName || maybePhone)) {
      const propagate: any = { last_active: nowIso };
      if (safeName) propagate.name = safeName;
      if (maybePhone) propagate.phone = maybePhone;

      await supabase
        .from("w_contacts")
        .update(propagate)
        .eq("organization_id", organization_id)
        .eq("wa_key", wa_key)
        .or('name.is.null,name.eq.""');

      if (maybePhone) {
        await supabase
          .from("w_contacts")
          .update({ phone: maybePhone })
          .eq("organization_id", organization_id)
          .eq("wa_key", wa_key)
          .is("phone", null);
      }
    }

    io.to(`org:${organization_id}`).emit("contact_updated", {
      contact: updated,
    });
    return updated;
  }

  const insertPayload: any = {
    organization_id,
    wa_account_id,
    wa_id,
    name: safeName || null,
    last_active: nowIso,
    wa_key: wa_key || null,
    phone: maybePhone,
    contact_type,
    save_source: "auto",
  };

  if (profilePhotoUrl) {
    insertPayload.custom_fields = {
      profile_photo_url: profilePhotoUrl,
      profile_photo_checked_at: nowIso,
    };
  }

  // Use upsert with ON CONFLICT to handle race conditions
  const { data: inserted, error: insErr } = await supabase
    .from("w_contacts")
    .upsert(insertPayload, {
      onConflict: "organization_id,wa_id",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (insErr) throw insErr;
  io.to(`org:${organization_id}`).emit("contact_updated", {
    contact: inserted,
  });
  return inserted;
}

// ====== Helper: Auto Assign Conversation ======
async function performAutoAssignment(
  organization_id: string,
  conversation_id: string,
) {
  try {
    // 1. Fetch organization settings
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", organization_id)
      .single();

    if (orgErr || !org?.settings?.auto_assign?.enabled) return;

    const config = org.settings.auto_assign;
    const batchSize = Math.max(1, config.batch_size || 1);
    const pausedAgents = config.paused_agents || [];
    let state = config.state || { last_agent_id: null, current_batch_count: 0 };

    // 2. Fetch eligible agents
    const { data: members, error: memErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organization_id)
      .eq("role", "agent")
      .eq("is_active", true);

    if (memErr || !members || members.length === 0) return;

    const eligibleAgents = members
      .map((m: any) => m.user_id)
      .filter((id: string) => !pausedAgents.includes(id));

    if (eligibleAgents.length === 0) return;

    // 3. Determine next agent
    let nextAgentId = eligibleAgents[0];
    let newBatchCount = 1;

    if (state.last_agent_id && eligibleAgents.includes(state.last_agent_id)) {
      if (state.current_batch_count < batchSize) {
        // Keep assigning to the same agent
        nextAgentId = state.last_agent_id;
        newBatchCount = state.current_batch_count + 1;
      } else {
        // Move to next agent
        const currentIndex = eligibleAgents.indexOf(state.last_agent_id);
        const nextIndex = (currentIndex + 1) % eligibleAgents.length;
        nextAgentId = eligibleAgents[nextIndex];
        newBatchCount = 1;
      }
    } else {
      // Last agent not found or no state, start fresh with first eligible
      nextAgentId = eligibleAgents[0];
      newBatchCount = 1;
    }

    // 4. Update the conversation
    const { data: updatedConv, error: updErr } = await supabase
      .from("w_conversations")
      .update({ assigned_agent_id: nextAgentId, assigned_to: nextAgentId })
      .eq("id", conversation_id)
      .select("assigned_agent_id, assigned_to")
      .single();

    if (updErr) throw updErr;

    // Fetch agent name
    const { data: agentData } = await supabase
      .from("organization_members")
      .select("name")
      .eq("user_id", nextAgentId)
      .single();

    // Broadcast update
    io.to(`org:${organization_id}`).emit("conversation_updated", {
      id: conversation_id,
      assigned_agent_id: nextAgentId,
      assigned_agent_name: agentData?.name || null,
    });

    // 5. Update state in organization settings
    const newAutoAssign = {
      ...config,
      state: { last_agent_id: nextAgentId, current_batch_count: newBatchCount },
    };

    await supabase
      .from("organizations")
      .update({ settings: { ...org.settings, auto_assign: newAutoAssign } })
      .eq("id", organization_id);

    console.log(
      `[Auto Assign] Assigned conversation ${conversation_id} to agent ${nextAgentId} (Count: ${newBatchCount}/${batchSize})`,
    );
  } catch (e) {
    console.error("[Auto Assign Error]", e);
  }
}

// ====== Helper: upsert conversation ======
async function upsertConversation(
  organization_id: string,
  wa_account_id: string,
  contact_id: string,
  lastMessageOpts: any,
) {
  // UPSERT not supported on custom unique constraints easily in all pg versions via simple client,
  // but here we have unique(organization_id, contact_id).

  // We want to increment unread_count if inbound, set to 0 if outbound (usually).
  // Actually, logic:
  // If inbound: unread_count = unread_count + 1
  // If outbound: unread_count = 0 (agent replied)

  const { data: existing } = await supabase
    .from("w_conversations")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("wa_account_id", wa_account_id)
    .eq("contact_id", contact_id)
    .maybeSingle();

  let newUnread = existing?.unread_count || 0;

  if (lastMessageOpts.direction === "inbound") {
    newUnread += 1;
  } else {
    newUnread = 0; // Agent replied, so it's read
  }

  const payload = {
    organization_id,
    wa_account_id,
    contact_id,
    last_message_at: new Date().toISOString(),
    last_message_preview: lastMessageOpts.preview || "Media",
    unread_count: newUnread,
    status: "open",
  };

  if (existing) {
    const { data, error } = await supabase
      .from("w_conversations")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) console.error("Conversation Update Error:", error);

    if (
      data &&
      !data.assigned_agent_id &&
      lastMessageOpts.direction === "inbound"
    ) {
      // Run asynchronously to avoid blocking
      performAutoAssignment(organization_id, data.id).catch(console.error);
    }

    return data;
  } else {
    const { data, error } = await supabase
      .from("w_conversations")
      .insert(payload)
      .select()
      .single();
    if (error) console.error("Conversation Insert Error:", error);

    if (data && lastMessageOpts.direction === "inbound") {
      performAutoAssignment(organization_id, data.id).catch(console.error);
    }

    return data;
  }
}

// ====== Helper: store message ======
async function storeMessage(params: {
  organization_id: string;
  contact_id: string;
  conversation_id?: string;
  wa_message_id?: string | null;
  direction: "inbound" | "outbound";
  type: string;
  content: any;
  status: "sent" | "delivered" | "read" | "failed";
  is_bot_reply?: boolean;
  bot_agent_id?: string | null;
  sender_type?: "customer" | "human_agent" | "ai_agent" | "system";
  sender_user_id?: string | null;
  is_internal_note?: boolean;
  automation_source?:
    | "flow"
    | "ai_agent"
    | "broadcast"
    | "manual"
    | "webhook"
    | "n8n"
    | "system"
    | null;
  handoff_triggered?: boolean;
  metadata?: any;
}) {
  const textBody =
    typeof params.content?.text === "string" ? params.content.text : null;
  const mediaUrl =
    typeof params.content?.media_url === "string"
      ? params.content.media_url
      : null;
  const mediaMime =
    typeof params.content?.mime_type === "string"
      ? params.content.mime_type
      : null;
  const mediaSize = Number.isFinite(Number(params.content?.size))
    ? Number(params.content.size)
    : null;
  const durationSeconds = Number.isFinite(
    Number(params.content?.duration_seconds),
  )
    ? Number(params.content.duration_seconds)
    : null;
  const waveform = params.content?.waveform ?? null;
  const isBotReply =
    params.is_bot_reply === true ||
    params.content?.is_bot_reply === true ||
    params.content?.is_flow === true ||
    !!params.bot_agent_id ||
    !!params.content?.bot_agent_id;
  const botAgentId =
    params.bot_agent_id || params.content?.bot_agent_id || null;
  const senderType =
    params.sender_type ||
    (params.is_internal_note ? "system" : null) ||
    (params.direction === "inbound" ? "customer" : null) ||
    (isBotReply ? "ai_agent" : "human_agent");
  const automationSource =
    params.automation_source ||
    (params.content?.is_flow ? "flow" : null) ||
    (isBotReply ? "ai_agent" : null) ||
    (params.direction === "outbound" ? "manual" : "webhook");

  const payload = {
    organization_id: params.organization_id,
    conversation_id: (params as any).conversation_id,
    contact_id: params.contact_id,
    wa_message_id: params.wa_message_id || null,
    direction: params.direction,
    type: params.type,
    content: params.content,
    text_body: textBody,
    media_url: mediaUrl,
    media_mime: mediaMime,
    media_size: mediaSize,
    duration_seconds: durationSeconds,
    waveform,
    status: params.status,
    is_bot_reply: isBotReply,
    bot_agent_id: botAgentId,
    sender_type: senderType,
    sender_user_id: params.sender_user_id || null,
    is_internal_note: params.is_internal_note === true,
    automation_source: automationSource,
    handoff_triggered: params.handoff_triggered === true,
    metadata: params.metadata || {},
  };

  // During history sync Baileys can deliver the same WA message again.
  // Upsert by wa_message_id (unique) when present to avoid crashing ingestion.
  const op = params.wa_message_id
    ? supabase
        .from("w_messages")
        .upsert(payload, { onConflict: "wa_message_id" })
    : supabase.from("w_messages").insert(payload);

  const { data, error } = await op
    .select("id, wa_message_id, created_at")
    .maybeSingle();
  if (error) throw error;
  return data;
}

type ReactionEntry = { emoji: string; from: string; at: string };

function applyReactionUpdate(
  current: any,
  emoji: string | null,
  from: string,
): ReactionEntry[] {
  const list: ReactionEntry[] = Array.isArray(current)
    ? current.filter(Boolean)
    : [];
  const cleaned = list.filter((r) => r && r.from !== from);
  if (!emoji) return cleaned;
  cleaned.push({ emoji, from, at: new Date().toISOString() });
  return cleaned;
}

// ====== Helper: get best flow reply from bot_flows ======
async function getFlowReply(organization_id: string, text: string) {
  const normalized = (text || "").toLowerCase().trim();
  if (!normalized) return null;

  const { data: flows, error } = await supabase
    .from("w_bot_flows")
    .select("id,name,trigger_keywords,flow_data,is_active")
    .eq("organization_id", organization_id)
    .eq("is_active", true);

  if (error) throw error;

  // Simple keyword match
  for (const flow of flows || []) {
    const keywords: string[] = flow.trigger_keywords || [];
    const hit = keywords.some((k) =>
      normalized.includes(String(k).toLowerCase()),
    );
    if (!hit) continue;

    // Expect flow_data like: { reply_text: "..." }
    const reply = flow.flow_data?.reply_text;
    if (reply) return String(reply);
  }

  return null;
}

// ====== Helper: get bot agent reply ======
async function getBotAgentReply(params: {
  organization_id: string;
  conversation_id: string;
  text: string;
}): Promise<{ reply: string; agent: any } | null> {
  const { organization_id, conversation_id, text } = params;
  const normalized = (text || "").toLowerCase().trim();
  if (!normalized) return null;

  try {
    // First check if bot is enabled for this specific conversation
    const { data: conv, error: convErr } = await supabase
      .from("w_conversations")
      .select("bot_enabled, assigned_bot_id")
      .eq("id", conversation_id)
      .single();

    if (convErr) throw convErr;

    // Per-chat toggle disables only AI-agent fallback. Flow Builder still runs first.
    if (conv?.bot_enabled === false) return null;

    // If no specific bot is selected for this conversation, check workspace bot rules.
    let targetAgent = null;

    if (conv?.bot_enabled && conv?.assigned_bot_id) {
      // Use the specifically assigned bot
      const { data: agent, error: agentErr } = await supabase
        .from("bot_agents")
        .select("*")
        .eq("id", conv.assigned_bot_id)
        .eq("is_active", true)
        .single();

      if (agentErr) throw agentErr;
      targetAgent = agent;
    } else {
      // Check all active bots and match by keywords
      const { data: agents, error: agentsErr } = await supabase
        .from("bot_agents")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("is_active", true);

      if (agentsErr) throw agentsErr;

      // Find the first agent with matching keywords.
      for (const agent of agents || []) {
        const settings = getAgentAutomationSettings(agent);
        if (!settings.reply_on_keywords) continue;
        const keywords: string[] = agent.trigger_keywords || [];
        const hit = keywords.some((k: string) =>
          normalized.includes(String(k).toLowerCase()),
        );
        if (hit) {
          targetAgent = agent;
          break;
        }
      }

      // If no keyword matched, use a default/unknown-chat agent when configured.
      if (!targetAgent) {
        targetAgent =
          (agents || []).find((agent: any) => {
            const settings = getAgentAutomationSettings(agent);
            return (
              settings.default_for_new_chats || settings.auto_reply_unknown
            );
          }) || null;
      }
    }

    if (!targetAgent) return null;

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      const { data: settings } = await supabase
        .from("openai_settings")
        .select("api_key_encrypted")
        .eq("organization_id", organization_id)
        .single();
      apiKey = settings?.api_key_encrypted || "";
    }

    if (!apiKey) {
      console.log("No OpenAI API key configured, using static reply");
      // Return a static reply if no API key
      return {
        reply: `Hi! I'm ${targetAgent.name}. ${targetAgent.description || "How can I help you?"}`,
        agent: targetAgent,
      };
    }

    // Build knowledge base context
    let knowledgeContext =
      await getOrganizationKnowledgeContext(organization_id);
    if (
      targetAgent.knowledge_base_content &&
      Array.isArray(targetAgent.knowledge_base_content)
    ) {
      const agentKnowledgeContext = stripAgentMetadataItems(
        targetAgent.knowledge_base_content,
      )
        .map((item: any) => item?.content || "")
        .filter(Boolean)
        .join("\n\n");
      knowledgeContext = [knowledgeContext, agentKnowledgeContext]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
    }

    // Call OpenAI
    const systemPrompt =
      targetAgent.system_prompt ||
      `You are ${targetAgent.name}, a helpful WhatsApp assistant. ${targetAgent.description || ""}`;

    const messages = [
      {
        role: "system",
        content:
          systemPrompt +
          (knowledgeContext ? `\n\nKnowledge Base:\n${knowledgeContext}` : ""),
      },
      {
        role: "user",
        content: text,
      },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetAgent.model || "gpt-3.5-turbo",
        messages,
        temperature: Number(targetAgent.temperature) || 0.7,
        max_tokens: 500,
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error(
        "OpenAI API error:",
        data.error?.message || "Unknown error",
      );
      return {
        reply: `Hi! I'm ${targetAgent.name}. I'm having trouble processing your request right now. Please try again later.`,
        agent: targetAgent,
      };
    }

    const reply = data.choices?.[0]?.message?.content || "";
    if (!reply) return null;

    return { reply, agent: targetAgent };
  } catch (err) {
    console.error("getBotAgentReply error:", err);
    return null;
  }
}

const SUPPORTED_FLOW_NODE_TYPES = new Set([
  "startBotFlow",
  "textMessage",
  "template",
  "button",
  "interactive",
  "userInput",
  "condition",
  "image",
  "video",
  "audio",
  "file",
  "location",
  "whatsappFlow",
  "ai",
  "httpApi",
  "googleSheets",
  "appointment",
  "product",
  "handoff",
  "end",
]);

type FlowEngineResult = {
  consumed: boolean;
  output: string | null;
  interactive?: any;
  media?: Array<{
    type: "image" | "video" | "audio" | "document";
    url: string;
    caption?: string;
    fileName?: string;
    mimeType?: string;
  }>;
  handoff?: boolean;
  flow_id?: string | null;
  flow_version_id?: string | null;
  flow_session_id?: string | null;
  flow_run_id?: string | null;
  flow_node_id?: string | null;
};

function parseFlowKeywords(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function getFlowTriggerKeywords(flow: any, nodesOverride?: any[]): string[] {
  const nodes = Array.isArray(nodesOverride)
    ? nodesOverride
    : Array.isArray(flow?.nodes)
      ? flow.nodes
      : [];
  const startNode = nodes.find((n: any) => n?.type === "startBotFlow");
  return [
    ...new Set([
      ...parseFlowKeywords(flow?.trigger_keywords),
      ...parseFlowKeywords(flow?.triggers),
      ...parseFlowKeywords(startNode?.data?.config?.keywords),
    ]),
  ];
}

function normalizeFlowAccountScope(value: any) {
  return value === "selected" ? "selected" : "all";
}

function normalizeFlowAccountIds(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(isUuid);
}

function isMissingFlowVersionAccountColumnsError(error: any) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  const code = String(error?.code || "");
  return (
    (code === "PGRST204" || code === "42703") &&
    message.includes("w_flow_versions") &&
    (message.includes("wa_account_scope") || message.includes("wa_account_ids"))
  );
}

async function insertFlowVersionWithSchemaFallback(payload: any) {
  const insertPayload = {
    ...payload,
    wa_account_scope: normalizeFlowAccountScope(payload?.wa_account_scope),
    wa_account_ids: normalizeFlowAccountIds(payload?.wa_account_ids),
  };

  const firstAttempt = await supabase
    .from("w_flow_versions")
    .insert(insertPayload)
    .select()
    .single();

  if (
    !firstAttempt.error ||
    !isMissingFlowVersionAccountColumnsError(firstAttempt.error)
  ) {
    return firstAttempt;
  }

  const legacyPayload = { ...insertPayload };
  delete legacyPayload.wa_account_scope;
  delete legacyPayload.wa_account_ids;

  console.warn(
    "[Flow] w_flow_versions account scope columns are missing. " +
      "Retrying publish with legacy schema; run supabase/migrations/20260523_flow_versions_account_scope_fix.sql.",
  );

  return supabase
    .from("w_flow_versions")
    .insert(legacyPayload)
    .select()
    .single();
}

function flowAppliesToAccount(flow: any, waAccountId?: string | null) {
  const scope = normalizeFlowAccountScope(flow?.wa_account_scope);
  if (scope !== "selected") return true;
  const ids = normalizeFlowAccountIds(flow?.wa_account_ids);
  if (ids.length === 0) return false;
  return Boolean(waAccountId && ids.includes(String(waAccountId)));
}

function flowAccountScopesOverlap(a: any, b: any) {
  const aScope = normalizeFlowAccountScope(a?.wa_account_scope);
  const bScope = normalizeFlowAccountScope(b?.wa_account_scope);
  if (aScope === "all" || bScope === "all") return true;
  const aIds = new Set(normalizeFlowAccountIds(a?.wa_account_ids));
  return normalizeFlowAccountIds(b?.wa_account_ids).some((id) => aIds.has(id));
}

async function findFlowTriggerConflicts(
  orgId: string,
  flow: any,
  triggerKeywords: string[],
) {
  const keywords = new Set(
    (triggerKeywords || [])
      .map((item) =>
        String(item || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  if (keywords.size === 0) return [];

  const { data, error } = await supabase
    .from("w_flows")
    .select(
      "id, name, status, trigger_keywords, triggers, wa_account_scope, wa_account_ids",
    )
    .eq("organization_id", orgId)
    .eq("status", "active")
    .neq("id", flow.id);
  if (error) throw error;

  return (data || [])
    .filter((other: any) => flowAccountScopesOverlap(flow, other))
    .map((other: any) => {
      const otherKeywords = getFlowTriggerKeywords(other);
      const overlap = otherKeywords.filter((item) =>
        keywords.has(String(item).trim().toLowerCase()),
      );
      return overlap.length > 0 ? { flow: other, triggers: overlap } : null;
    })
    .filter(Boolean);
}

function normalizeFlowVariableKey(value: any) {
  return String(value || "")
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function renderFlowTemplate(value: any, state: any = {}) {
  return String(value || "").replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_match, rawKey) => {
      const key = normalizeFlowVariableKey(rawKey);
      const foundKey = Object.keys(state || {}).find(
        (candidate) => normalizeFlowVariableKey(candidate) === key,
      );
      const replacement = foundKey ? state[foundKey] : state?.[key];
      return replacement == null ? "" : String(replacement);
    },
  );
}

function validateFlowDefinition(flow: any) {
  const errors: string[] = [];
  const nodes: any[] = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges: any[] = Array.isArray(flow?.edges) ? flow.edges : [];
  const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean));
  const startNodes = nodes.filter((n) => n?.type === "startBotFlow");
  const reachable = new Set<string>();

  if (startNodes.length !== 1)
    errors.push("Flow must have exactly one Start Bot Flow node.");
  if (nodes.length === 0) errors.push("Flow must contain at least one node.");

  for (const edge of edges) {
    if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) {
      errors.push("Flow has a broken connection.");
      break;
    }
  }

  if (startNodes.length === 1) {
    const stack = [startNodes[0].id];
    while (stack.length) {
      const id = stack.pop();
      if (!id || reachable.has(id)) continue;
      reachable.add(id);
      edges.filter((e) => e.source === id).forEach((e) => stack.push(e.target));
    }
  }

  const nodesToValidate =
    reachable.size > 0
      ? nodes.filter((n) => n?.id && reachable.has(n.id))
      : nodes;

  for (const node of nodesToValidate) {
    if (!SUPPORTED_FLOW_NODE_TYPES.has(node?.type)) {
      errors.push(
        `Unsupported node "${node?.type || "unknown"}" is not available in this flow builder.`,
      );
    }
    const config = node?.data?.config || {};
    if (
      node?.type === "textMessage" &&
      !String(config.message || config.text || "").trim()
    ) {
      errors.push("Text Message node must have message text.");
    }
    if (node?.type === "button") {
      const buttons = Array.isArray(config.buttons)
        ? config.buttons.filter((b: any) => String(b?.text || "").trim())
        : [];
      if (buttons.length === 0)
        errors.push("Button node must have at least one button.");
      if (buttons.length > 3)
        errors.push("Button node can have maximum 3 WhatsApp buttons.");
    }
    if (
      node?.type === "userInput" &&
      !String(config.saveToField || "").trim()
    ) {
      errors.push("User Input node must save the answer to a field.");
    }
    if (
      node?.type === "condition" &&
      (!String(config.variable || "").trim() ||
        !String(config.operator || "").trim() ||
        !String(config.value || "").trim())
    ) {
      errors.push("Condition node must have variable, operator, and value.");
    }
  }

  if (startNodes.length === 1) {
    const keywords = getFlowTriggerKeywords(flow, nodes);
    if (
      (flow?.trigger_type || "keyword") === "keyword" &&
      keywords.length === 0
    ) {
      errors.push("Start node must have trigger keywords.");
    }
  }

  if (
    normalizeFlowAccountScope(flow?.wa_account_scope) === "selected" &&
    normalizeFlowAccountIds(flow?.wa_account_ids).length === 0
  ) {
    errors.push(
      "Select at least one WhatsApp account or switch the flow to all connected numbers.",
    );
  }

  return { valid: errors.length === 0, errors };
}

async function logFlowStep(params: {
  organization_id: string;
  run_id?: string | null;
  node_id: string;
  node_type: string;
  input_data?: any;
  output_data?: any;
  status?: "success" | "failed" | "skipped" | "waiting";
  error_message?: string | null;
}) {
  if (!params.run_id) return;
  try {
    await supabase.from("w_flow_run_steps").insert({
      organization_id: params.organization_id,
      run_id: params.run_id,
      node_id: params.node_id,
      node_type: params.node_type,
      input_data: params.input_data || {},
      output_data: params.output_data || {},
      status: params.status || "success",
      error_message: params.error_message || null,
    });
  } catch (err: any) {
    console.warn("[Flow] Step log failed:", err?.message || err);
  }
}

async function triggerHandoffWebhook(params: {
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  event?: string;
  flow_id?: string | null;
  flow_version_id?: string | null;
  flow_session_id?: string | null;
  flow_run_id?: string | null;
  flow_node_id?: string | null;
  handoff_reason?: string | null;
  requested_by_user_id?: string | null;
  summary_required?: boolean;
  state_data?: any;
  selected_text?: string | null;
  trigger_message_id?: string | null;
}) {
  if (!N8N_HANDOFF_WEBHOOK_URL || params.summary_required === false) return;

  try {
    const { data: conversation } = await supabase
      .from("w_conversations")
      .select(
        "id, assigned_agent_id, assigned_to, handoff_status, summary_status, last_message_at",
      )
      .eq("id", params.conversation_id)
      .eq("organization_id", params.organization_id)
      .maybeSingle();

    const { data: contact } = await supabase
      .from("w_contacts")
      .select("id, name, custom_name, phone, wa_id, custom_fields")
      .eq("id", params.contact_id)
      .eq("organization_id", params.organization_id)
      .maybeSingle();

    const { data: recentRows } = await supabase
      .from("w_messages")
      .select(
        "id, direction, sender_type, automation_source, text_body, content, created_at",
      )
      .eq("organization_id", params.organization_id)
      .eq("conversation_id", params.conversation_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const messages = (recentRows || []).reverse().map((message: any) => ({
      id: message.id,
      direction: message.direction,
      sender_type: message.sender_type,
      automation_source: message.automation_source,
      text:
        message.text_body ||
        message.content?.text ||
        message.content?.body ||
        "",
      created_at: message.created_at,
    }));

    const payload = {
      event: params.event || "manual_summary_requested",
      organization_id: params.organization_id,
      conversation_id: params.conversation_id,
      contact_id: params.contact_id,
      flow_id: params.flow_id || null,
      flow_version_id: params.flow_version_id || null,
      flow_session_id: params.flow_session_id || null,
      flow_run_id: params.flow_run_id || null,
      flow_node_id: params.flow_node_id || null,
      trigger_message_id: params.trigger_message_id || null,
      selected_text: params.selected_text || null,
      requested_by_user_id: params.requested_by_user_id || null,
      handoff_reason: params.handoff_reason || "Manual summary requested",
      state_data: params.state_data || {},
      summary_required: true,
      callback_url: `${PUBLIC_BASE_URL}/api/n8n/conversations/${params.conversation_id}/summary`,
      contact,
      conversation,
      messages,
      created_at: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      N8N_WEBHOOK_TIMEOUT_MS,
    );

    const response = await fetch(N8N_HANDOFF_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(N8N_WEBHOOK_SECRET ? { "X-N8N-Secret": N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${body}`.trim());
    }
  } catch (err: any) {
    console.error("[n8n] Handoff webhook failed:", err?.message || err);
    await supabase
      .from("w_conversations")
      .update({
        summary_status: "failed",
      })
      .eq("id", params.conversation_id)
      .eq("organization_id", params.organization_id);
  }
}

// ====== Helper: Process Flow Engine ======
async function processFlowEngine(
  organization_id: string,
  contact_id: string,
  conversation_id: string,
  text: string,
  triggerMessageId?: string | null,
  incomingWaAccountId?: string | null,
): Promise<FlowEngineResult> {
  const normalized = text.toLowerCase().trim();

  // Flow Builder has priority and is independent from the per-chat AI-agent toggle.

  // 1. Check for active session
  const { data: session } = await supabase
    .from("w_flow_sessions")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("conversation_id", conversation_id)
    .in("status", ["active", "waiting"])
    .maybeSingle();

  let currentFlowId: string | null = null;
  let currentNodeId: string | null = null;
  let session_id: string | null = null;
  let currentFlowVersionId: string | null = null;
  let run_id: string | null = null;
  let isResuming = false;

  if (session) {
    currentFlowId = session.flow_id;
    currentFlowVersionId = session.flow_version_id || null;
    currentNodeId = session.current_node_id;
    session_id = session.id;
    run_id = session.active_run_id || null;
    isResuming = true;
  } else {
    // 2. Check for trigger matches in active flows
    const { data: activeFlows } = await supabase
      .from("w_flows")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("status", "active");

    const accountEligibleFlows = (activeFlows || []).filter((flow: any) =>
      flowAppliesToAccount(flow, incomingWaAccountId),
    );

    let matchedFlow = null;
    let matchedVersion = null;
    for (const flow of accountEligibleFlows) {
      let version = null;
      if (flow.current_version_id) {
        const { data } = await supabase
          .from("w_flow_versions")
          .select("*")
          .eq("id", flow.current_version_id)
          .maybeSingle();
        version = data;
      }
      const nodes = version?.nodes || flow.nodes || [];
      const allTriggers = getFlowTriggerKeywords(version || flow, nodes);

      if (
        allTriggers.some((t: string) => normalized.includes(t.toLowerCase()))
      ) {
        matchedFlow = flow;
        matchedVersion = version;
        break;
      }
    }

    if (!matchedFlow) {
      console.log("[Flow] No active flow matched; AI fallback may run", {
        organization_id,
        conversation_id,
        text: normalized,
        active_flow_count: activeFlows?.length || 0,
        account_eligible_flow_count: accountEligibleFlows.length,
        incoming_wa_account_id: incomingWaAccountId || null,
        triggers: accountEligibleFlows.map((flow: any) => ({
          id: flow.id,
          name: flow.name,
          trigger_keywords: flow.trigger_keywords,
          triggers: flow.triggers,
          wa_account_scope: flow.wa_account_scope || "all",
          wa_account_ids: flow.wa_account_ids || [],
        })),
      });
      return { consumed: false, output: null };
    }

    console.log("[Flow] Matched active flow", {
      organization_id,
      conversation_id,
      flow_id: matchedFlow.id,
      flow_name: matchedFlow.name,
      flow_version_id:
        matchedVersion?.id || matchedFlow.current_version_id || null,
      incoming_wa_account_id: incomingWaAccountId || null,
    });

    currentFlowId = matchedFlow.id;
    currentFlowVersionId =
      matchedVersion?.id || matchedFlow.current_version_id || null;
    // Find start node
    const nodes = matchedVersion?.nodes || matchedFlow.nodes || [];
    const startNode = nodes.find((n: any) => n.type === "startBotFlow");
    if (!startNode) return { consumed: false, output: null };

    currentNodeId = startNode.id;

    // Create or find active session
    const { data: newSession, error: sessErr } = await supabase
      .from("w_flow_sessions")
      .insert({
        organization_id,
        conversation_id,
        contact_id,
        flow_id: currentFlowId,
        flow_version_id: currentFlowVersionId,
        current_node_id: currentNodeId,
        status: "active",
        state_data: {},
      })
      .select()
      .single();

    if (sessErr) {
      console.error("Session create error:", sessErr);
      // Agar duplicate error hai toh existing session use karo
      if (sessErr.code === "23505") {
        const { data: existingSession } = await supabase
          .from("w_flow_sessions")
          .select("*")
          .eq("organization_id", organization_id)
          .eq("conversation_id", conversation_id)
          .in("status", ["active", "waiting"])
          .maybeSingle();
        if (existingSession) {
          currentFlowId = existingSession.flow_id;
          currentFlowVersionId =
            existingSession.flow_version_id || currentFlowVersionId;
          currentNodeId = existingSession.current_node_id;
          session_id = existingSession.id;
          run_id = existingSession.active_run_id || null;
          isResuming = true;
        }
      }
    } else if (newSession) {
      session_id = newSession.id;
    }

    if (!run_id) {
      const { data: newRun } = await supabase
        .from("w_flow_runs")
        .insert({
          organization_id,
          conversation_id,
          contact_id,
          flow_id: currentFlowId,
          flow_version_id: currentFlowVersionId,
          session_id,
          trigger_message_id: triggerMessageId || null,
          status: "running",
        })
        .select("id")
        .maybeSingle();
      run_id = newRun?.id || null;
      if (session_id && run_id) {
        await supabase
          .from("w_flow_sessions")
          .update({ active_run_id: run_id })
          .eq("id", session_id);
      }
    }

    console.log(
      `🆕 New flow session created: ${session_id}, starting at node: ${currentNodeId}`,
    );
  }

  if (!currentFlowId || !currentNodeId || !session_id) {
    return { consumed: false, output: null };
  }

  // Flow data load karo
  let flowData = null;
  if (currentFlowVersionId) {
    const { data } = await supabase
      .from("w_flow_versions")
      .select("nodes, edges")
      .eq("id", currentFlowVersionId)
      .maybeSingle();
    flowData = data;
  }
  if (!flowData) {
    const { data } = await supabase
      .from("w_flows")
      .select("nodes, edges")
      .eq("id", currentFlowId)
      .single();
    flowData = data;
  }

  if (!flowData) return { consumed: true, output: null };

  const nodes: any[] = flowData.nodes || [];
  const edges: any[] = flowData.edges || [];
  const { data: latestSessionState } = await supabase
    .from("w_flow_sessions")
    .select("state_data")
    .eq("id", session_id)
    .maybeSingle();
  let flowState = latestSessionState?.state_data || session?.state_data || {};
  const flowMeta = {
    flow_id: currentFlowId,
    flow_version_id: currentFlowVersionId,
    flow_session_id: session_id,
    flow_run_id: run_id,
  };

  // ----------------------------------------------------------------
  // RESUMING: User ne button click kiya ya kuch type kiya
  // Pehle current node ke edges check karo aur next node pe jao
  // ----------------------------------------------------------------
  if (isResuming) {
    const currentNode = nodes.find((n: any) => n.id === currentNodeId);

    if (currentNode?.type === "button" || currentNode?.type === "userInput") {
      if (currentNode.type === "userInput") {
        const saveToField = normalizeFlowVariableKey(
          currentNode.data?.config?.saveToField,
        );
        if (saveToField) {
          const nextState = {
            ...(session?.state_data || {}),
            [saveToField]: text,
          };
          await supabase
            .from("w_flow_sessions")
            .update({ state_data: nextState })
            .eq("id", session_id);
          flowState = nextState;
        }
      }
      // User ka response match karo outgoing edges se
      const outEdges = edges.filter((e: any) => e.source === currentNodeId);
      let nextEdge: any = null;

      if (outEdges.length === 1) {
        nextEdge = outEdges[0];
      } else if (outEdges.length > 1) {
        const buttons = currentNode?.data?.config?.buttons || [];
        const matchedButtonIndex = buttons.findIndex(
          (b: any) =>
            String(b?.text || "")
              .trim()
              .toLowerCase() === normalized,
        );
        if (matchedButtonIndex >= 0) {
          nextEdge = outEdges.find(
            (e: any) => e.sourceHandle === `button-${matchedButtonIndex}`,
          );
        }
        // Button ID, title, ya label se match karo
        nextEdge =
          nextEdge ||
          outEdges.find((e: any) => {
            const handle = (e.sourceHandle || "").toLowerCase();
            const label = (e.label || "").toLowerCase();
            return (
              handle === normalized ||
              label === normalized ||
              normalized.includes(handle)
            );
          }) ||
          outEdges.find((e: any) => {
            // Fallback to sourceHandle comparison if label fails
            return (
              e.sourceHandle &&
              normalized.includes(e.sourceHandle.toLowerCase())
            );
          }) ||
          outEdges[0]; // fallback: pehla edge
      }

      if (nextEdge) {
        currentNodeId = nextEdge.target;
        await supabase
          .from("w_flow_sessions")
          .update({ current_node_id: currentNodeId })
          .eq("id", session_id);
        console.log(`➡️ Advancing to node: ${currentNodeId}`);
      } else {
        // Koi edge nahi — flow complete
        await supabase
          .from("w_flow_sessions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", session_id);
        if (run_id)
          await supabase
            .from("w_flow_runs")
            .update({ status: "completed", ended_at: new Date().toISOString() })
            .eq("id", run_id);
        return { consumed: true, output: null, ...flowMeta };
      }
    }
  }

  // ----------------------------------------------------------------
  // Node execution loop — current node se chalo
  // ----------------------------------------------------------------
  let activeNode = nodes.find((n: any) => n.id === currentNodeId);
  const outputText: string[] = [];
  const mediaOutput: NonNullable<FlowEngineResult["media"]> = [];
  let steps = 0;

  while (activeNode && steps < 15) {
    steps++;
    const nodeType = activeNode.type;
    const config = activeNode.data?.config || {};

    console.log(`⚙️ Executing node: ${nodeType} (${activeNode.id})`);
    await logFlowStep({
      organization_id,
      run_id,
      node_id: activeNode.id,
      node_type: nodeType,
      input_data: { text },
      status:
        nodeType === "button" || nodeType === "userInput"
          ? "waiting"
          : "success",
    });

    // --- TEXT MESSAGE ---
    if (nodeType === "textMessage") {
      const msg = config.message || config.text || activeNode.data?.label || "";
      if (msg) outputText.push(renderFlowTemplate(msg, flowState));
    }

    // --- BUTTON NODE ---
    else if (nodeType === "button") {
      const body = renderFlowTemplate(
        config.text || config.headerText || "Choose an option:",
        flowState,
      );
      const footer = renderFlowTemplate(config.footerText || "", flowState);
      const buttons = (config.buttons || [])
        .filter((b: any) => b.text)
        .slice(0, 3);

      // Session mein current_node_id save karo — next message yahan se resume hoga
      await supabase
        .from("w_flow_sessions")
        .update({ current_node_id: activeNode.id })
        .eq("id", session_id);

      if (buttons.length > 0) {
        return {
          consumed: true,
          output: outputText.length > 0 ? outputText.join("\n\n") : null,
          media: mediaOutput.length > 0 ? mediaOutput : undefined,
          ...flowMeta,
          flow_node_id: activeNode.id,
          interactive: {
            type: "button",
            body,
            footer,
            buttons: buttons.map((b: any) => ({
              id: b.id || b.text,
              text: b.text,
            })),
          },
        };
      } else {
        // Buttons nahi hain toh text fallback
        outputText.push(body);
        return {
          consumed: true,
          output: outputText.join("\n\n"),
          media: mediaOutput.length > 0 ? mediaOutput : undefined,
          ...flowMeta,
          flow_node_id: activeNode.id,
        };
      }
    }

    // --- INTERACTIVE LIST NODE ---
    else if (nodeType === "interactive") {
      const body = renderFlowTemplate(
        config.headerText || config.text || "Choose an option:",
        flowState,
      );
      const items = (config.items || [])
        .filter((item: any) => item.title)
        .map(
          (item: any, index: number) =>
            `${index + 1}. ${item.title}${item.description ? ` - ${item.description}` : ""}`,
        );

      outputText.push(items.length > 0 ? `${body}\n${items.join("\n")}` : body);
    }

    // --- USER INPUT NODE ---
    else if (nodeType === "userInput") {
      const question = renderFlowTemplate(
        config.question || config.text || "",
        flowState,
      );
      if (question) outputText.push(question);
      // Session save karo
      await supabase
        .from("w_flow_sessions")
        .update({ current_node_id: activeNode.id })
        .eq("id", session_id);
      return {
        consumed: true,
        output: outputText.join("\n\n"),
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    // --- CONDITION NODE ---
    else if (nodeType === "condition") {
      const variableKey = normalizeFlowVariableKey(config.variable || "");
      const operator = config.operator || "contains";
      const actualValue = String(
        variableKey ? (flowState?.[variableKey] ?? "") : text,
      ).toLowerCase();
      const expectedValue = renderFlowTemplate(
        config.value || "",
        flowState,
      ).toLowerCase();

      let conditionMet = false;
      if (operator === "contains")
        conditionMet = actualValue.includes(expectedValue);
      else if (operator === "equals")
        conditionMet = actualValue === expectedValue;
      else if (operator === "notEquals")
        conditionMet = actualValue !== expectedValue;
      else if (operator === "starts_with")
        conditionMet = actualValue.startsWith(expectedValue);
      else if (operator === "ends_with")
        conditionMet = actualValue.endsWith(expectedValue);
      else if (operator === "greaterThan")
        conditionMet = Number(actualValue) > Number(expectedValue);
      else if (operator === "lessThan")
        conditionMet = Number(actualValue) < Number(expectedValue);
      else conditionMet = true;

      // Condition ke hisaab se sahi edge dhundo
      const outEdges = edges.filter((e: any) => e.source === activeNode.id);
      const matchEdge =
        outEdges.find((e: any) => {
          const h = (e.sourceHandle || "").toLowerCase();
          return conditionMet
            ? h === "yes" || h === "true"
            : h === "no" || h === "false";
        }) || outEdges[0];

      if (matchEdge) {
        activeNode = nodes.find((n: any) => n.id === matchEdge.target);
        continue;
      } else {
        break;
      }
    }

    // --- MEDIA NODES (image, video, audio, file) ---
    else if (["image", "video", "audio", "file"].includes(nodeType)) {
      const url = config.url || config.mediaUrl || "";
      const caption = renderFlowTemplate(
        config.caption || config.message || "",
        flowState,
      );
      if (url) {
        mediaOutput.push({
          type: nodeType === "file" ? "document" : nodeType,
          url: renderFlowTemplate(url, flowState),
          caption: caption || undefined,
          fileName: config.fileName || config.displayName || undefined,
          mimeType: config.mimeType || undefined,
        });
      }
    }

    // --- LOCATION NODE ---
    else if (nodeType === "location") {
      const lat = config.latitude;
      const lng = config.longitude;
      const name = config.name || "";
      if (lat && lng) {
        outputText.push(`📍 ${name}\nhttps://maps.google.com/?q=${lat},${lng}`);
      }
    }

    // --- TEMPLATE NODE ---
    else if (nodeType === "template") {
      const source = config.templateSource || "whatsapp";
      if (source === "flow") {
        const flowName =
          config.template || config.flowTemplateId || "Flow template";
        if (flowName) outputText.push(`[Flow Template: ${flowName}]`);
      } else {
        const tplName = config.templateName || config.template;
        if (tplName) outputText.push(`[Template: ${tplName}]`);
      }
    }

    // --- WHATSAPP FLOW NODE ---
    else if (nodeType === "whatsappFlow") {
      const message =
        config.message ||
        config.text ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (message) outputText.push(renderFlowTemplate(message, flowState));
    }

    // --- AI NODE ---
    else if (nodeType === "ai") {
      const botResult = await getBotAgentReply({
        organization_id,
        conversation_id,
        text,
      });
      const prompt =
        config.prompt ||
        config.systemPrompt ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (botResult?.reply) outputText.push(botResult.reply);
      else if (config.fallbackMessage)
        outputText.push(renderFlowTemplate(config.fallbackMessage, flowState));
      else if (prompt) outputText.push(renderFlowTemplate(prompt, flowState));
    }

    // --- HTTP/API + DATA NODES ---
    else if (nodeType === "httpApi") {
      const url = renderFlowTemplate(config.url || "", flowState);
      if (url) {
        console.log(
          "[Flow] HTTP API node configured; publish/runtime pass-through enabled",
          {
            node_id: activeNode.id,
            method: config.method || "GET",
            url,
          },
        );
      }
    } else if (nodeType === "googleSheets") {
      console.log(
        "[Flow] Google Sheets node configured; publish/runtime pass-through enabled",
        {
          node_id: activeNode.id,
          action: config.action || null,
          spreadsheet: config.spreadsheet || null,
        },
      );
    } else if (nodeType === "appointment") {
      const message =
        config.message ||
        config.confirmationMessage ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (message) outputText.push(renderFlowTemplate(message, flowState));
    } else if (nodeType === "product") {
      const productText =
        config.message ||
        config.description ||
        config.productName ||
        config.product ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (productText)
        outputText.push(renderFlowTemplate(productText, flowState));
    }

    // Automatic advance — next edge dhundo
    if (nodeType === "handoff") {
      const handoffMessage =
        config.message || config.label || activeNode.data?.label || "";
      const conversationPatch: any = {
        handoff_status: "handoff_requested",
        handoff_reason: config.reason || "Flow requested human handoff",
        handoff_requested_at: new Date().toISOString(),
        summary_status: "not_started",
      };
      if (config.disableBotAfterHandoff !== false)
        conversationPatch.bot_enabled = false;
      await supabase
        .from("w_conversations")
        .update(conversationPatch)
        .eq("id", conversation_id);
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      return {
        consumed: true,
        output: renderFlowTemplate(handoffMessage, flowState) || null,
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        handoff: true,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    if (nodeType === "end") {
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      const finalMessage = config.message
        ? renderFlowTemplate(config.message, flowState)
        : null;
      return {
        consumed: true,
        output:
          finalMessage ||
          (outputText.length > 0 ? outputText.join("\n\n") : null),
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    const nextEdge = edges.find((e: any) => e.source === activeNode.id);
    if (nextEdge) {
      activeNode = nodes.find((n: any) => n.id === nextEdge.target);
    } else {
      // Flow khatam
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      console.log(`✅ Flow completed for session ${session_id}`);
      activeNode = null;
    }
  }

  return {
    consumed: true,
    output: outputText.length > 0 ? outputText.join("\n\n") : null,
    media: mediaOutput.length > 0 ? mediaOutput : undefined,
    ...flowMeta,
  };
}

// ====== API Endpoints ======

app.get("/api/dashboard-stats", authMiddleware, async (req: any, res) => {
  try {
    const organization_id = req.organization_id;
    const range = String(req.query.range || "today").toLowerCase();
    const now = new Date();
    const start = new Date(now);
    if (range === "7d" || range === "7days") start.setDate(now.getDate() - 6);
    else if (range === "30d" || range === "30days")
      start.setDate(now.getDate() - 29);
    else start.setHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    const optional = async <T>(fallback: T, fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (error: any) {
        console.warn(
          "[dashboard-stats] optional block failed:",
          error?.message || error,
        );
        return fallback;
      }
    };

    const messageQuery = supabase
      .from("w_messages")
      .select(
        "id, status, direction, sender_type, is_bot_reply, automation_source, created_at, content, conversation_id, contact:w_contacts(name, phone)",
      )
      .eq("organization_id", organization_id)
      .gte("created_at", startIso)
      .order("created_at", { ascending: false })
      .limit(5000);

    const [
      messagesResult,
      contactsCountResult,
      savedContactsResult,
      conversationsResult,
      accountsResult,
      flowsResult,
      notesCount,
      campaigns,
    ] = await Promise.all([
      messageQuery,
      supabase
        .from("w_contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .or("contact_type.eq.individual,contact_type.is.null")
        .not("saved_at", "is", null),
      supabase
        .from("w_contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization_id)
        .or("contact_type.eq.individual,contact_type.is.null")
        .not("saved_at", "is", null),
      supabase
        .from("w_conversations")
        .select(
          "id, handoff_status, summary_status, bot_enabled, unread_count, last_message_at, created_at",
        )
        .eq("organization_id", organization_id)
        .order("last_message_at", { ascending: false })
        .limit(1000),
      supabase
        .from("w_wa_accounts")
        .select("id, name, display_phone_number, status, created_at")
        .eq("organization_id", organization_id),
      optional({ data: [], error: null } as any, async () =>
        supabase
          .from("w_flows")
          .select("id, name, status, current_version_id, updated_at")
          .eq("organization_id", organization_id)
          .neq("status", "archived"),
      ),
      optional(0, async () => {
        const { count, error } = await supabase
          .from("w_conversation_notes")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organization_id)
          .gte("created_at", startIso);
        if (error) throw error;
        return count || 0;
      }),
      optional([] as any[], async () => {
        const { data, error } = await supabase
          .from("w_campaigns")
          .select(
            "id, name, status, total_contacts, sent_count, failed_count, created_at, scheduled_at",
          )
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        return data || [];
      }),
    ]);

    if (messagesResult.error) throw messagesResult.error;
    if (contactsCountResult.error) throw contactsCountResult.error;
    if (savedContactsResult.error) throw savedContactsResult.error;
    if (conversationsResult.error) throw conversationsResult.error;
    if (accountsResult.error) throw accountsResult.error;
    if (flowsResult.error) throw flowsResult.error;

    const messages = messagesResult.data || [];
    const conversations = conversationsResult.data || [];
    const accounts = accountsResult.data || [];
    const flows = flowsResult.data || [];

    const counts = {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
      inbound: 0,
      outbound: 0,
      customer: 0,
      humanAgent: 0,
      aiAgent: 0,
      system: 0,
      broadcast: 0,
      flow: 0,
    };

    const dailyMap = new Map<string, any>();
    const hourlyMap = new Map<string, any>();
    messages.forEach((m: any) => {
      const status = String(m.status || "").toLowerCase();
      const senderType = String(m.sender_type || "").toLowerCase();
      const automationSource = String(m.automation_source || "").toLowerCase();
      if (status === "sent") counts.sent++;
      else if (status === "delivered") counts.delivered++;
      else if (status === "read") counts.read++;
      else if (status === "failed") counts.failed++;
      else counts.pending++;
      if (m.direction === "inbound") counts.inbound++;
      if (m.direction === "outbound") counts.outbound++;
      if (senderType === "customer") counts.customer++;
      if (senderType === "human_agent") counts.humanAgent++;
      if (senderType === "ai_agent" || m.is_bot_reply) counts.aiAgent++;
      if (senderType === "system") counts.system++;
      if (automationSource === "broadcast") counts.broadcast++;
      if (automationSource === "flow") counts.flow++;

      const day = new Date(m.created_at).toISOString().slice(0, 10);
      const row = dailyMap.get(day) || {
        date: day,
        total: 0,
        inbound: 0,
        outbound: 0,
        failed: 0,
        read: 0,
      };
      row.total++;
      if (m.direction === "inbound") row.inbound++;
      if (m.direction === "outbound") row.outbound++;
      if (status === "failed") row.failed++;
      if (status === "read") row.read++;
      dailyMap.set(day, row);

      const createdAt = new Date(m.created_at);
      const hour = `${String(createdAt.getHours()).padStart(2, "0")}:00`;
      const hourRow = hourlyMap.get(hour) || {
        hour,
        total: 0,
        inbound: 0,
        outbound: 0,
        failed: 0,
        read: 0,
      };
      hourRow.total++;
      if (m.direction === "inbound") hourRow.inbound++;
      if (m.direction === "outbound") hourRow.outbound++;
      if (status === "failed") hourRow.failed++;
      if (status === "read") hourRow.read++;
      hourlyMap.set(hour, hourRow);
    });

    const hourlyTimeline = Array.from({ length: 24 }).map((_, hourIndex) => {
      const hour = `${String(hourIndex).padStart(2, "0")}:00`;
      return (
        hourlyMap.get(hour) || {
          hour,
          total: 0,
          inbound: 0,
          outbound: 0,
          failed: 0,
          read: 0,
        }
      );
    });

    const total = messages.length;
    const readRate = total > 0 ? (counts.read / total) * 100 : 0;
    const deliveryRate =
      total > 0 ? ((counts.delivered + counts.read) / total) * 100 : 0;
    const failureRate = total > 0 ? (counts.failed / total) * 100 : 0;
    const humanHandoff = conversations.filter((c: any) =>
      ["handoff_requested", "human_active"].includes(c.handoff_status),
    ).length;
    const summariesReady = conversations.filter(
      (c: any) => c.summary_status === "ready",
    ).length;
    const unread = conversations.reduce(
      (sum: number, c: any) => sum + Number(c.unread_count || 0),
      0,
    );
    const activeAccounts = accounts.filter(
      (a: any) => a.status !== "disconnected",
    ).length;
    const publishedFlows = flows.filter(
      (f: any) => f.current_version_id || f.status === "published",
    ).length;
    const totalCampaigns = campaigns.length;
    const sentCampaignMessages = campaigns.reduce(
      (sum: number, c: any) => sum + Number(c.sent_count || 0),
      0,
    );
    const failedCampaignMessages = campaigns.reduce(
      (sum: number, c: any) => sum + Number(c.failed_count || 0),
      0,
    );

    const latestMessage = messages[0];
    const recentMessages = messages.slice(0, 6).map((m: any) => {
      const content =
        typeof m.content === "string"
          ? m.content
          : m.content?.text ||
            m.content?.body ||
            m.content?.caption ||
            m.content?.type ||
            "Message";
      const contact = Array.isArray(m.contact) ? m.contact[0] : m.contact;
      return {
        id: m.id,
        kind: "message",
        title:
          m.direction === "inbound"
            ? "New customer message"
            : m.sender_type === "ai_agent" || m.is_bot_reply
              ? "Automation replied"
              : "Team reply sent",
        description: String(content || "Message").slice(0, 140),
        meta: contact?.name || contact?.phone || m.status || "Conversation",
        status: m.status || m.direction,
        created_at: m.created_at,
      };
    });

    res.json({
      range,
      generated_at: new Date().toISOString(),
      metrics: {
        totalMessages: total,
        delivered: counts.delivered + counts.read,
        sent: counts.sent,
        read: counts.read,
        failed: counts.failed,
        pending: counts.pending,
        readRate: Math.round(readRate),
        failedRate: Number(failureRate.toFixed(1)),
        deliveryRate: Math.round(deliveryRate),
        inbound: counts.inbound,
        outbound: counts.outbound,
        customer: counts.customer,
        humanAgent: counts.humanAgent,
        aiAgent: counts.aiAgent,
        system: counts.system,
        broadcast: counts.broadcast,
        flow: counts.flow,
      },
      contacts: {
        total: contactsCountResult.count || 0,
        saved: savedContactsResult.count || 0,
      },
      conversations: {
        total: conversations.length,
        humanHandoff,
        botActive: conversations.filter(
          (c: any) =>
            c.bot_enabled !== false && c.handoff_status === "bot_active",
        ).length,
        summariesReady,
        unread,
      },
      accounts: {
        total: accounts.length,
        active: activeAccounts,
        connected: accounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          display_phone_number: a.display_phone_number,
          status: a.status,
        })),
      },
      automation: {
        flows: flows.length,
        publishedFlows,
        activeFlowSessions: conversations.filter(
          (c: any) => c.bot_enabled !== false,
        ).length,
        notesGenerated: notesCount,
      },
      campaigns: {
        total: totalCampaigns,
        sent: sentCampaignMessages,
        failed: failedCampaignMessages,
        latest: campaigns.slice(0, 5),
      },
      health: {
        status: failureRate > 15 ? "red" : failureRate > 5 ? "yellow" : "green",
        quality: Math.max(0, 100 - Math.round(failureRate * 2)),
        lastMessageAt: latestMessage?.created_at || null,
      },
      timeline: Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      hourlyTimeline,
      recentActivity: recentMessages,
    });
  } catch (err: any) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/flow-sessions/:contact_id", async (req, res) => {
  try {
    const { contact_id } = req.params;
    const { data, error } = await supabase
      .from("w_flow_sessions")
      .select(`*, w_flows ( name )`)
      .eq("contact_id", contact_id)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/flow-sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("w_flow_sessions")
      .update({ status: "abandoned" })
      .eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createTemporaryPassword() {
  return `Flow-${crypto.randomBytes(6).toString("base64url")}`;
}

function getInviteExpiryDate() {
  return new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

function getFrontendBaseUrl() {
  return process.env.FRONTEND_URL || "http://localhost:3000";
}

function getMemberInviteState(member: any) {
  if (member?.invite_accepted_at || member?.is_active) return "active";
  const expiresAt = member?.invite_expires_at
    ? new Date(member.invite_expires_at)
    : null;
  if (
    expiresAt &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt.getTime() <= Date.now()
  )
    return "expired";
  return "pending";
}

async function sendTeamInviteEmail(params: {
  email: string;
  name: string;
  role: string;
  password: string;
  inviteLink: string;
  expiresAt: Date;
}) {
  const roleLabel =
    String(params.role || "agent")
      .charAt(0)
      .toUpperCase() + String(params.role || "agent").slice(1);
  const expiresLabel = params.expiresAt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
  await sendEmail(
    params.email,
    `Invitation to join GAP FlowPilot Team`,
    `
        <div style="margin:0; padding:0; background:#f5f7fa;">
            <div style="font-family:Arial,Helvetica,sans-serif; max-width:640px; margin:0 auto; padding:32px 20px;">
                <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                    <div style="padding:28px 32px 22px 32px; border-bottom:1px solid #eef2f7;">
                        <div style="display:inline-block; padding:6px 10px; border-radius:999px; background:#e9fbf1; color:#128C7E; font-size:12px; font-weight:700; line-height:1;">
                            GAP FlowPilot invitation
                        </div>
                        <h1 style="margin:18px 0 8px 0; color:#111827; font-size:28px; line-height:1.25; font-weight:500;">
                            You have been invited to join the team
                        </h1>
                        <p style="margin:0; color:#4b5563; font-size:15px; line-height:1.6;">
                            Hello <strong style="color:#111827;">${params.name}</strong>, your workspace owner invited you as a <strong style="color:#111827;">${roleLabel}</strong>.
                        </p>
                    </div>

                    <div style="padding:28px 32px;">
                        <p style="margin:0 0 22px 0; color:#374151; font-size:15px; line-height:1.7;">
                            Accept the invitation to activate your account and open your agent workspace for WhatsApp conversations.
                        </p>

                        <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:18px; margin:0 0 24px 0;">
                            <p style="margin:0 0 14px 0; color:#111827; font-size:14px; font-weight:700;">Login details</p>
                            <table role="presentation" style="width:100%; border-collapse:collapse;">
                                <tr>
                                    <td style="padding:8px 0; color:#6b7280; font-size:13px; width:96px;">Email</td>
                                    <td style="padding:8px 0; color:#111827; font-size:14px; font-weight:600;">${params.email}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0; color:#6b7280; font-size:13px;">Password</td>
                                    <td style="padding:8px 0; color:#111827; font-size:14px; font-weight:700; letter-spacing:0.3px;">${params.password}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0; color:#6b7280; font-size:13px;">Expires</td>
                                    <td style="padding:8px 0; color:#111827; font-size:14px;">${expiresLabel}</td>
                                </tr>
                            </table>
                        </div>

                        <a href="${params.inviteLink}" style="display:block; width:100%; box-sizing:border-box; text-align:center; background:#128C7E; color:#ffffff; padding:14px 20px; text-decoration:none; border-radius:999px; font-size:14px; font-weight:700;">
                            Accept invitation
                        </a>

                        <p style="margin:18px 0 0 0; color:#6b7280; font-size:13px; line-height:1.6;">
                            If the button does not work, open this link:
                            <br />
                            <a href="${params.inviteLink}" style="color:#128C7E; word-break:break-all; text-decoration:none;">${params.inviteLink}</a>
                        </p>
                    </div>

                    <div style="padding:18px 32px; background:#f8fafc; border-top:1px solid #eef2f7;">
                        <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.6;">
                            For security, this invitation expires in ${INVITE_TTL_HOURS} hour${INVITE_TTL_HOURS === 1 ? "" : "s"}. This email was sent from the GAP FlowPilot dashboard.
                        </p>
                    </div>
                </div>
            </div>
        </div>
        `,
  );
}

app.get(
  "/api/contacts/:id/profile-photo",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    try {
      const { data: contact, error } = await supabase
        .from("w_contacts")
        .select("id, phone, wa_id, custom_fields")
        .eq("id", req.params.id)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (error) throw error;
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      const url = await getCachedProfilePhotoUrl(
        contact.wa_id || contact.phone,
      );
      if (url) {
        await supabase
          .from("w_contacts")
          .update({
            custom_fields: {
              ...(contact.custom_fields &&
              typeof contact.custom_fields === "object"
                ? contact.custom_fields
                : {}),
              profile_photo_url: url,
              profile_photo_checked_at: new Date().toISOString(),
            },
          })
          .eq("id", contact.id);
      }

      res.json({
        contact_id: contact.id,
        has_photo: !!url,
        profile_photo_url: url,
        active_whatsapp_sessions: sessions.size,
        jid: toProfilePhotoJid(contact.wa_id || contact.phone),
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err.message || "Failed to fetch profile photo" });
    }
  },
);

app.get("/api/conversations", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;
  const wa_account_id = req.query.wa_account_id as string; // Optional filter
  const user_id = req.user.id;
  const user_role = req.role;

  if (!organization_id) {
    return res
      .status(403)
      .json({ error: "No organization linked to this account" });
  }

  try {
    let query = supabase
      .from("w_conversations")
      .select(
        `
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields, saved_at, saved_by_user_id, save_source)
            `,
      )
      .eq("organization_id", organization_id)
      .order("last_message_at", { ascending: false });

    // ROLE BASED FILTERING (Step 2G)
    if (user_role === "agent") {
      query = query.eq("assigned_agent_id", user_id);
    }

    if (wa_account_id && wa_account_id !== "All") {
      if (isUuid(wa_account_id)) {
        query = query.eq("wa_account_id", wa_account_id);
      } else {
        // Frontend may pass a display phone (e.g. 9194...) instead of UUID/phone_number_id.
        const raw = String(wa_account_id);
        const digits = raw.replace(/\D+/g, "");

        const findAccountId = async (value: string) => {
          const { data: byPhoneId, error: e1 } = await supabase
            .from("w_wa_accounts")
            .select("id")
            .eq("phone_number_id", value)
            .maybeSingle();
          if (e1) throw e1;
          if (byPhoneId?.id) return byPhoneId.id;

          const { data: byDisplay, error: e2 } = await supabase
            .from("w_wa_accounts")
            .select("id")
            .eq("display_phone_number", value)
            .maybeSingle();
          if (e2) throw e2;
          if (byDisplay?.id) return byDisplay.id;

          return null;
        };

        let accountId = await findAccountId(raw);
        if (!accountId && digits && digits !== raw)
          accountId = await findAccountId(digits);

        if (accountId) {
          query = query.eq("wa_account_id", accountId);
        } else {
          // Dev-friendly behavior: conversations may exist even if wa_accounts was never bootstrapped.
          // In that case, don't blank the inbox; just skip the account filter.
          console.warn(
            `⚠️ wa_account_id filter '${wa_account_id}' could not be resolved to a wa_accounts.id. ` +
              `Skipping account filter (dev mode).`,
          );
        }
      }
    }

    let { data: conversations, error } = await query;
    if (error) throw error;

    // Fetch Read States for this user
    let readStatesMap = new Map();
    if (user_id && conversations?.length) {
      const { data: reads, error: readErr } = await supabase
        .from("w_conversation_reads")
        .select("conversation_id, last_read_at")
        .eq("user_id", user_id)
        .in(
          "conversation_id",
          conversations.map((c: any) => c.id),
        );

      if (!readErr && reads) {
        reads.forEach((r: any) =>
          readStatesMap.set(r.conversation_id, r.last_read_at),
        );
      }
    }

    // Compute unread count from message statuses (source of truth).
    // This prevents stale conversations.unread_count from showing "all-time" counts.
    const unreadCountMap = new Map<string, number>();
    if (conversations?.length) {
      const conversationIds = conversations.map((c: any) => c.id);
      const { data: unreadRows, error: unreadErr } = await supabase
        .from("w_messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .in("direction", ["inbound", "in"])
        .neq("status", "read");

      if (unreadErr) {
        console.warn(
          "⚠️ Failed to compute unread counts:",
          unreadErr.message || unreadErr,
        );
      } else if (Array.isArray(unreadRows)) {
        for (const row of unreadRows) {
          const cid = (row as any)?.conversation_id;
          if (!cid) continue;
          unreadCountMap.set(cid, (unreadCountMap.get(cid) || 0) + 1);
        }
      }
    }

    // Transform Data
    const result = await Promise.all(
      conversations.map(async (c: any) => {
        const lastReadAt = readStatesMap.get(c.id);
        const userHasRead = lastReadAt
          ? new Date(lastReadAt) >= new Date(c.last_message_at)
          : false;

        const unread_for_user = unreadCountMap.get(c.id) || 0;

        const next = { ...c };

        // Normalize contact.phone for UI: prefer a real phone number over provider ids.
        if (next?.contact) {
          const phone = String(next.contact.phone || "").trim();
          if (!phone) {
            const derived = derivePhoneForStorage(next.contact.wa_id);
            if (derived) next.contact.phone = derived;
          }
          if (!next.contact.wa_key) {
            next.contact.wa_key =
              normalizeIndianPhoneKey(next.contact.wa_id) || null;
          }
          const storedPhoto =
            next.contact.custom_fields?.profile_photo_url || null;
          next.contact.profile_photo_url =
            storedPhoto ||
            (await getCachedProfilePhotoUrl(
              next.contact.wa_id || next.contact.phone,
            ));
          if (
            next.contact.profile_photo_url &&
            next.contact.profile_photo_url !== storedPhoto &&
            next.contact.id
          ) {
            supabase
              .from("w_contacts")
              .update({
                custom_fields: {
                  ...(next.contact.custom_fields &&
                  typeof next.contact.custom_fields === "object"
                    ? next.contact.custom_fields
                    : {}),
                  profile_photo_url: next.contact.profile_photo_url,
                  profile_photo_checked_at: new Date().toISOString(),
                },
              })
              .eq("id", next.contact.id)
              .then(({ error }: { error: any }) => {
                if (error)
                  console.warn(
                    "Failed to persist profile photo URL:",
                    error.message,
                  );
              });
          }
        }

        return {
          ...next,
          user_has_read: userHasRead,
          unread_for_user,
        };
      }),
    );

    res.json(result);
  } catch (err: any) {
    console.error("Error fetching conversations:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/conversations/start", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;
  const { contact_id, wa_account_id } = req.body;

  if (!organization_id) {
    return res
      .status(403)
      .json({ error: "No organization linked to this account" });
  }
  if (!contact_id) {
    return res.status(400).json({ error: "contact_id is required" });
  }

  try {
    // Resolve account id if not provided
    let targetAccountId = wa_account_id;
    if (!targetAccountId) {
      // Find the first connected account for this org
      const { data: account } = await supabase
        .from("w_wa_accounts")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      targetAccountId = account?.id;
    }

    if (!targetAccountId) {
      // Try any account as fallback
      const { data: anyAccount } = await supabase
        .from("w_wa_accounts")
        .select("id")
        .eq("organization_id", organization_id)
        .limit(1)
        .maybeSingle();
      targetAccountId = anyAccount?.id;
    }

    if (!targetAccountId) {
      return res
        .status(400)
        .json({
          error:
            "No WhatsApp account found for this organization. Please connect one first.",
        });
    }

    // Check if conversation already exists
    const { data: existing, error: findErr } = await supabase
      .from("w_conversations")
      .select(
        `
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields)
            `,
      )
      .eq("organization_id", organization_id)
      .eq("wa_account_id", targetAccountId)
      .eq("contact_id", contact_id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing) {
      return res.json(existing);
    }

    // Create new conversation
    const { data: newConv, error: createErr } = await supabase
      .from("w_conversations")
      .insert({
        organization_id,
        wa_account_id: targetAccountId,
        contact_id,
        last_message_at: new Date().toISOString(),
        last_message_preview: "Conversation started",
        unread_count: 0,
        status: "open",
      })
      .select(
        `
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields)
            `,
      )
      .single();

    if (createErr) throw createErr;

    // Emit conversation created event to sockets
    io.to(`org:${organization_id}`).emit("conversation_created", newConv);

    return res.json(newConv);
  } catch (err: any) {
    console.error("Error starting conversation:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to start conversation" });
  }
});

app.get("/api/contacts", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;
  const includeGroups = req.query.include_groups === "true";
  const includeUnsaved = req.query.include_unsaved === "true";

  if (!organization_id) {
    return res
      .status(403)
      .json({ error: "No organization linked to this account" });
  }

  try {
    let query = supabase
      .from("w_contacts")
      .select(
        "id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source",
      )
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false });

    // By default, only show individual w_contacts (not groups/channels)
    if (!includeGroups) {
      query = query.or("contact_type.eq.individual,contact_type.is.null");
    }

    if (!includeUnsaved) {
      query = query.not("saved_at", "is", null);
    }

    let { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map((c: any) => {
      const next = { ...c };
      const phone = String(next.phone || "").trim();
      if (!phone) {
        const derived = derivePhoneForStorage(next.wa_id);
        if (derived) next.phone = derived;
      }
      if (!next.wa_key) {
        next.wa_key = normalizeIndianPhoneKey(next.wa_id) || null;
      }
      return next;
    });

    res.json(rows);
  } catch (err: any) {
    console.error("Error fetching contacts:", err);
    res.status(500).json({ error: err.message || "Failed to fetch contacts" });
  }
});

app.post("/api/contacts", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;
  const {
    name,
    phone,
    custom_name,
    tags = [],
    custom_fields = {},
    wa_account_id = null,
  } = req.body || {};

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const phoneDigits = normalizeWaIdToPhone(phone);
    if (!phoneDigits) {
      return res.status(400).json({ error: "Valid phone number is required" });
    }

    const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
    const normalizedPhone = wa_key;
    const normalizedTags = Array.isArray(tags)
      ? tags.map((tag: any) => String(tag).trim()).filter(Boolean)
      : String(tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
    const normalizedCustomFields =
      custom_fields &&
      typeof custom_fields === "object" &&
      !Array.isArray(custom_fields)
        ? Object.fromEntries(
            Object.entries(custom_fields)
              .map(([key, value]) => [
                String(key).trim(),
                value == null ? "" : String(value).trim(),
              ])
              .filter(([key]) => Boolean(key)),
          )
        : {};

    let normalizedAccountId: string | null = null;
    if (wa_account_id) {
      const { data: account, error: accountErr } = await supabase
        .from("w_wa_accounts")
        .select("id")
        .eq("id", String(wa_account_id))
        .eq("organization_id", organization_id)
        .maybeSingle();
      if (accountErr) throw accountErr;
      if (!account?.id)
        return res
          .status(400)
          .json({ error: "Selected WhatsApp account was not found" });
      normalizedAccountId = account.id;
    }

    const { data: existing, error: existingErr } = await supabase
      .from("w_contacts")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("wa_key", wa_key)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing?.id) {
      return res.status(409).json({ error: "Contact already exists" });
    }

    await enforcePlanResourceLimit({
      organization_id,
      resource: "contacts",
      table: "w_contacts",
      filters: { contact_type: "individual" },
      label: "Contact",
    });

    const { data, error } = await supabase
      .from("w_contacts")
      .insert({
        organization_id,
        wa_account_id: normalizedAccountId,
        name: String(name || "").trim() || normalizedPhone,
        custom_name:
          typeof custom_name === "string" && custom_name.trim()
            ? custom_name.trim()
            : null,
        phone: normalizedPhone,
        wa_id: normalizedPhone,
        wa_key,
        tags: normalizedTags,
        custom_fields: normalizedCustomFields,
        contact_type: "individual",
        saved_at: new Date().toISOString(),
        saved_by_user_id: req.user?.id || null,
        save_source: "manual",
      })
      .select(
        "id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source",
      )
      .single();
    if (error) throw error;

    io.emit("contact_updated", { contact: data });
    res.status(201).json(data);
  } catch (err: any) {
    console.error("Error creating contact:", err);
    res
      .status(err.statusCode || 500)
      .json({
        error: err.message || "Failed to create contact",
        limit: err.limit,
      });
  }
});

app.patch("/api/contacts/:id", authMiddleware, async (req: any, res) => {
  const contactId = req.params.id;
  const organization_id = req.organization_id;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const { data: existing, error: findErr } = await supabase
      .from("w_contacts")
      .select("id, organization_id, wa_key, custom_fields")
      .eq("id", contactId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing?.id)
      return res.status(404).json({ error: "Contact not found" });
    if (existing.organization_id !== organization_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updates: any = {};

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "custom_name")) {
      const raw = req.body?.custom_name ?? null;
      const custom_name = typeof raw === "string" ? raw.trim() : null;
      updates.custom_name = custom_name ? custom_name : null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
      updates.name = String(req.body?.name || "").trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "phone")) {
      const phoneDigits = normalizeWaIdToPhone(req.body?.phone);
      if (!phoneDigits)
        return res
          .status(400)
          .json({ error: "Valid phone number is required" });
      const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
      updates.phone = wa_key;
      updates.wa_id = wa_key;
      updates.wa_key = wa_key;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "tags")) {
      updates.tags = Array.isArray(req.body.tags)
        ? req.body.tags.map((tag: any) => String(tag).trim()).filter(Boolean)
        : String(req.body.tags || "")
            .split(",")
            .map((tag: string) => tag.trim())
            .filter(Boolean);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "custom_fields")) {
      const incoming =
        req.body.custom_fields &&
        typeof req.body.custom_fields === "object" &&
        !Array.isArray(req.body.custom_fields)
          ? Object.fromEntries(
              Object.entries(req.body.custom_fields)
                .map(([key, value]) => [
                  String(key).trim(),
                  value == null ? "" : String(value).trim(),
                ])
                .filter(([key]) => Boolean(key)),
            )
          : {};
      const currentFields =
        existing.custom_fields && typeof existing.custom_fields === "object"
          ? existing.custom_fields
          : {};
      const protectedFields = [
        "profile_photo_url",
        "profile_photo_checked_at",
      ].reduce((acc: any, key) => {
        if (currentFields[key]) acc[key] = currentFields[key];
        return acc;
      }, {});
      updates.custom_fields = { ...incoming, ...protectedFields };
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "wa_account_id")) {
      const nextAccountId = req.body.wa_account_id
        ? String(req.body.wa_account_id)
        : null;
      if (nextAccountId) {
        const { data: account, error: accountErr } = await supabase
          .from("w_wa_accounts")
          .select("id")
          .eq("id", nextAccountId)
          .eq("organization_id", organization_id)
          .maybeSingle();
        if (accountErr) throw accountErr;
        if (!account?.id)
          return res
            .status(400)
            .json({ error: "Selected WhatsApp account was not found" });
      }
      updates.wa_account_id = nextAccountId;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No contact fields were provided" });
    }

    // Apply alias to duplicates sharing the same wa_key to keep chat names consistent.
    if (
      existing.wa_key &&
      Object.prototype.hasOwnProperty.call(updates, "custom_name")
    ) {
      const { error: updAllErr } = await supabase
        .from("w_contacts")
        .update({ custom_name: updates.custom_name })
        .eq("organization_id", organization_id)
        .eq("wa_key", existing.wa_key);
      if (updAllErr) throw updAllErr;
    }

    const { data: updated, error: updErr } = await supabase
      .from("w_contacts")
      .update(updates)
      .eq("id", contactId)
      .select(
        "id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source",
      )
      .single();
    if (updErr) throw updErr;

    io.emit("contact_updated", { contact: updated });
    res.json(updated);
  } catch (err: any) {
    console.error("Error updating contact:", err);
    res.status(500).json({ error: err.message || "Failed to update contact" });
  }
});

app.post("/api/contacts/:id/save", authMiddleware, async (req: any, res) => {
  const contactId = req.params.id;
  const organization_id = req.organization_id;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const { data: existing, error: findErr } = await supabase
      .from("w_contacts")
      .select("id, organization_id, saved_at")
      .eq("id", contactId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing?.id)
      return res.status(404).json({ error: "Contact not found" });
    if (existing.organization_id !== organization_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data: updated, error: updErr } = await supabase
      .from("w_contacts")
      .update({
        saved_at: existing.saved_at || new Date().toISOString(),
        saved_by_user_id: req.user?.id || null,
        save_source: "manual",
      })
      .eq("id", contactId)
      .select(
        "id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source",
      )
      .single();
    if (updErr) throw updErr;

    io.emit("contact_updated", { contact: updated });
    res.json(updated);
  } catch (err: any) {
    console.error("Error saving contact:", err);
    res.status(500).json({ error: err.message || "Failed to save contact" });
  }
});

app.delete("/api/contacts/:id", authMiddleware, async (req: any, res) => {
  const contactId = req.params.id;
  const organization_id = req.organization_id;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const { data: existing, error: findErr } = await supabase
      .from("w_contacts")
      .select("id, organization_id")
      .eq("id", contactId)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing?.id)
      return res.status(404).json({ error: "Contact not found" });
    if (existing.organization_id !== organization_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { error } = await supabase
      .from("w_contacts")
      .delete()
      .eq("id", contactId)
      .eq("organization_id", organization_id);
    if (error) throw error;

    io.emit("contact_deleted", { id: contactId });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting contact:", err);
    res.status(500).json({ error: err.message || "Failed to delete contact" });
  }
});

// ====== Organization Knowledge Base API ======
app.get(
  "/api/settings/knowledge-base",
  authMiddleware,
  async (req: any, res) => {
    try {
      const documents = await getKnowledgeDocuments(req.organization_id);
      res.json({
        documents: documents.map((doc: any) => ({
          ...doc,
          content_preview: doc.content ? doc.content.slice(0, 220) : "",
          character_count: String(doc.content || "").length,
          content: undefined,
        })),
        total_documents: documents.length,
        total_characters: documents.reduce(
          (sum: number, doc: any) => sum + String(doc.content || "").length,
          0,
        ),
      });
    } catch (err: any) {
      console.error("Knowledge base list error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to load knowledge base" });
    }
  },
);

app.post(
  "/api/settings/knowledge-base",
  authMiddleware,
  upload.single("file"),
  async (req: any, res) => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "File is required" });
      if (file.size > KNOWLEDGE_MAX_FILE_SIZE) {
        return res.status(400).json({ error: "File must be 10MB or smaller" });
      }

      const ext = path.extname(file.originalname || "").toLowerCase();
      const isAllowedExt = [
        ".pdf",
        ".docx",
        ".txt",
        ".md",
        ".csv",
        ".json",
      ].includes(ext);
      const isAllowedMime =
        KNOWLEDGE_ALLOWED_MIME_TYPES.has(file.mimetype || "") ||
        (file.mimetype || "").startsWith("text/");
      if (!isAllowedExt && !isAllowedMime) {
        return res
          .status(400)
          .json({
            error:
              "Unsupported file type. Upload PDF, DOCX, TXT, MD, CSV, or JSON.",
          });
      }

      const extracted = (await extractKnowledgeText(file))
        .replace(/\r/g, "")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
      if (!extracted) {
        return res
          .status(400)
          .json({ error: "No readable text found in this file" });
      }

      const existing = await getKnowledgeDocuments(req.organization_id);
      const now = new Date().toISOString();
      const doc = normalizeKnowledgeDocument({
        id: crypto.randomUUID(),
        name: normalizeFilename(file.originalname || "knowledge-document"),
        mime_type: file.mimetype || "application/octet-stream",
        size: file.size,
        size_label: formatBytes(file.size),
        status: "INDEXED",
        content: extracted,
        created_at: now,
        updated_at: now,
      });

      const documents = await saveKnowledgeDocuments(
        req.organization_id,
        [doc, ...existing].slice(0, 50),
      );
      res.status(201).json({
        document: {
          ...doc,
          content_preview: doc.content.slice(0, 220),
          content: undefined,
        },
        total_documents: documents.length,
      });
    } catch (err: any) {
      console.error("Knowledge base upload error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to upload knowledge document" });
    }
  },
);

app.delete(
  "/api/settings/knowledge-base/:id",
  authMiddleware,
  async (req: any, res) => {
    try {
      const existing = await getKnowledgeDocuments(req.organization_id);
      const next = existing.filter((doc: any) => doc.id !== req.params.id);
      if (next.length === existing.length)
        return res.status(404).json({ error: "Document not found" });
      await saveKnowledgeDocuments(req.organization_id, next);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Knowledge base delete error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to delete knowledge document" });
    }
  },
);

// ====== Team Management APIs ======

// 2A. GET /api/team/members — All team members fetch karo
app.get("/api/team/members", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const { data, error } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(
      (data || []).map((member: any) => ({
        ...member,
        invite_status: getMemberInviteState(member),
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2B. POST /api/team/invite — Naya agent invite karo
app.post("/api/team/invite", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  const { email, name, role, password } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail || !name || !password)
    return res
      .status(400)
      .json({ error: "Email, name and password are required" });

  try {
    const inviteToken = createInviteToken();
    const inviteExpiresAt = getInviteExpiryDate();
    const temporaryPassword = password || createTemporaryPassword();

    // 1. Check if user already member
    const { data: existing } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", orgId)
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (!existing?.id) {
      await enforcePlanResourceLimit({
        organization_id: orgId,
        resource: "agents",
        table: "organization_members",
        filters: { role: ["agent", "admin"] },
        label: "Team member",
      });
    }

    // 2. Create user via Supabase Admin (Requires service_role key)
    let userId: string;
    if (existing?.user_id) {
      userId = existing.user_id;
      const { error: updateErr } = await supabase.auth.admin.updateUserById(
        userId,
        {
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            organization_id: orgId,
            role: role || "agent",
            name,
          },
        },
      );
      if (updateErr) throw updateErr;
    } else {
      const { data: inviteData, error: inviteErr } =
        await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { organization_id: orgId, role, name },
        });

      if (inviteErr) {
        // If user already exists, we might get an error. Try to find the user instead.
        if (
          inviteErr.message.includes("already been registered") ||
          inviteErr.status === 422
        ) {
          let page = 1;
          let existingUser;
          while (true) {
            const { data: users, error: listErr } =
              await supabase.auth.admin.listUsers({ page, perPage: 1000 });
            if (listErr) throw listErr;
            if (!users?.users?.length) break;

            existingUser = users.users.find(
              (u: any) => u.email?.toLowerCase() === normalizedEmail,
            );
            if (existingUser) break;

            if (users.users.length < 1000) break;
            page++;
          }

          if (!existingUser)
            throw new Error("User already registered but could not be found");
          userId = existingUser.id;

          const { error: updateErr } = await supabase.auth.admin.updateUserById(
            userId,
            {
              password: temporaryPassword,
              email_confirm: true,
              user_metadata: {
                ...(existingUser.user_metadata || {}),
                organization_id: orgId,
                role: role || "agent",
                name,
              },
            },
          );
          if (updateErr) throw updateErr;
        } else {
          throw inviteErr;
        }
      } else {
        userId = inviteData.user.id;
      }
    }

    // 3. Insert/update organization_members
    const memberPayload = {
      organization_id: orgId,
      user_id: userId,
      email: normalizedEmail,
      name,
      role: role || "agent",
      is_active: false,
      invite_token_hash: hashInviteToken(inviteToken),
      invite_expires_at: inviteExpiresAt.toISOString(),
      invite_sent_at: new Date().toISOString(),
      invite_accepted_at: null,
      invite_temp_password_encrypted: encryptToken(temporaryPassword),
    };

    const memberQuery = existing?.id
      ? supabase
          .from("organization_members")
          .update(memberPayload)
          .eq("id", existing.id)
          .eq("organization_id", orgId)
      : supabase.from("organization_members").insert(memberPayload);

    const { error: insertErr } = await memberQuery;

    if (insertErr) throw insertErr;

    // 4. Send custom invitation email
    try {
      const inviteLink = `${getFrontendBaseUrl()}/accept-invite?token=${encodeURIComponent(inviteToken)}`;
      await sendTeamInviteEmail({
        email: normalizedEmail,
        name,
        role: role || "agent",
        password: temporaryPassword,
        inviteLink,
        expiresAt: inviteExpiresAt,
      });
    } catch (mailErr) {
      console.error("Failed to send invitation email:", mailErr);
      // We don't throw here so the user is still created/invited in the DB
    }

    res.json({
      success: true,
      message: "Member invited successfully and email sent",
      expires_at: inviteExpiresAt.toISOString(),
    });
  } catch (err: any) {
    res
      .status(err.statusCode || 500)
      .json({ error: err.message, limit: err.limit });
  }
});

// 2C. PATCH /api/team/members/:id — Role/Status update karo
app.post("/api/team/invite/accept", async (req: any, res) => {
  const { token } = req.body || {};
  if (!token)
    return res.status(400).json({ error: "Invitation token is required" });

  try {
    const tokenHash = hashInviteToken(String(token));
    const { data: member, error } = await supabase
      .from("organization_members")
      .select("*")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();

    if (error) throw error;
    if (!member)
      return res
        .status(404)
        .json({ error: "Invitation link is invalid or has already been used" });
    if (member.invite_accepted_at)
      return res
        .status(409)
        .json({ error: "Invitation has already been accepted" });

    const expiresAt = member.invite_expires_at
      ? new Date(member.invite_expires_at)
      : null;
    if (
      !expiresAt ||
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      await supabase
        .from("organization_members")
        .update({ is_active: false })
        .eq("id", member.id);
      return res
        .status(410)
        .json({
          error:
            "Invitation link has expired. Please ask your admin to resend it.",
        });
    }

    const temporaryPassword = member.invite_temp_password_encrypted
      ? decryptToken(member.invite_temp_password_encrypted)
      : null;

    if (!temporaryPassword) {
      return res
        .status(400)
        .json({
          error:
            "Invitation is missing login credentials. Please ask your admin to resend it.",
        });
    }

    const { error: updateErr } = await supabase
      .from("organization_members")
      .update({
        is_active: true,
        invite_accepted_at: new Date().toISOString(),
        invite_token_hash: null,
        invite_temp_password_encrypted: null,
      })
      .eq("id", member.id);

    if (updateErr) throw updateErr;

    res.json({
      success: true,
      email: member.email,
      password: temporaryPassword,
      role: member.role || "agent",
    });
  } catch (err: any) {
    console.error("Accept invitation error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to accept invitation" });
  }
});

app.post(
  "/api/team/members/:id/resend-invite",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
      const { data: member, error: memberErr } = await supabase
        .from("organization_members")
        .select("*")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (memberErr) throw memberErr;
      if (!member) return res.status(404).json({ error: "Member not found" });
      if (member.role === "owner")
        return res
          .status(400)
          .json({ error: "Owner invitations cannot be resent" });
      if (getMemberInviteState(member) === "active")
        return res.status(400).json({ error: "This member is already active" });

      const inviteToken = createInviteToken();
      const inviteExpiresAt = getInviteExpiryDate();
      const temporaryPassword = createTemporaryPassword();

      const { error: authErr } = await supabase.auth.admin.updateUserById(
        member.user_id,
        {
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            organization_id: orgId,
            role: member.role || "agent",
            name: member.name,
          },
        },
      );
      if (authErr) throw authErr;

      const { error: updateErr } = await supabase
        .from("organization_members")
        .update({
          is_active: false,
          invite_token_hash: hashInviteToken(inviteToken),
          invite_expires_at: inviteExpiresAt.toISOString(),
          invite_sent_at: new Date().toISOString(),
          invite_accepted_at: null,
          invite_temp_password_encrypted: encryptToken(temporaryPassword),
        })
        .eq("id", member.id)
        .eq("organization_id", orgId);

      if (updateErr) throw updateErr;

      const inviteLink = `${getFrontendBaseUrl()}/accept-invite?token=${encodeURIComponent(inviteToken)}`;
      await sendTeamInviteEmail({
        email: member.email,
        name: member.name || member.email,
        role: member.role || "agent",
        password: temporaryPassword,
        inviteLink,
        expiresAt: inviteExpiresAt,
      });

      res.json({
        success: true,
        message: "Invitation resent",
        expires_at: inviteExpiresAt.toISOString(),
      });
    } catch (err: any) {
      console.error("Resend invitation error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to resend invitation" });
    }
  },
);

app.patch("/api/team/members/:id", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  const { id } = req.params;
  const { role, is_active, name } = req.body;

  try {
    const { error } = await supabase
      .from("organization_members")
      .update({ role, is_active, name })
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2D. DELETE /api/team/members/:id — Member remove karo
app.delete("/api/team/members/:id", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  const { id } = req.params;

  try {
    // Find the user_id of the member to delete their auth account
    const { data: member } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (member && member.user_id) {
      // Delete user from auth to completely revoke access
      await supabase.auth.admin.deleteUser(member.user_id);
    }

    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2E. GET /api/team/my-profile — Current agent ka profile
app.get("/api/team/my-profile", authMiddleware, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from("organization_members")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2F. PATCH /api/team/my-profile — Current user's basic profile
app.patch("/api/team/my-profile", authMiddleware, async (req: any, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const avatarColor = String(req.body?.avatar_color || "").trim();

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (name.length > 80)
      return res
        .status(400)
        .json({ error: "Name must be 80 characters or less" });
    if (avatarColor && !/^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
      return res.status(400).json({ error: "Invalid avatar color" });
    }

    const updatePayload: any = {
      name,
      avatar_color: avatarColor || "#4f46e5",
    };

    const { data, error } = await supabase
      .from("organization_members")
      .update(updatePayload)
      .eq("user_id", req.user.id)
      .eq("organization_id", req.organization_id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Profile not found" });

    try {
      await supabase.auth.admin.updateUserById(req.user.id, {
        user_metadata: {
          ...(req.user.user_metadata || {}),
          full_name: name,
          name,
          avatar_color: updatePayload.avatar_color,
        },
      });
    } catch (metadataErr: any) {
      console.warn(
        "[Profile] Failed to sync auth metadata:",
        metadataErr?.message || metadataErr,
      );
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update profile" });
  }
});

// 2G. PATCH /api/conversations/:id/assign — Chat assign karo agent ko
app.patch(
  "/api/conversations/:id/assign",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;
    const { agent_id } = req.body;

    try {
      const normalizedAgentId = agent_id ? String(agent_id) : null;
      if (normalizedAgentId) {
        const { data: member, error: memberErr } = await supabase
          .from("organization_members")
          .select("user_id, role, is_active")
          .eq("organization_id", orgId)
          .eq("user_id", normalizedAgentId)
          .maybeSingle();
        if (memberErr) throw memberErr;
        if (!member || member.role !== "agent" || member.is_active === false) {
          return res
            .status(400)
            .json({
              error: "Conversation can only be assigned to an active agent",
            });
        }
      }

      const { data: updated, error } = await supabase
        .from("w_conversations")
        .update({
          assigned_to: normalizedAgentId,
          assigned_agent_id: normalizedAgentId,
        })
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id, assigned_to")
        .single();

      if (error) throw error;

      io.to(`org:${orgId}`).emit("conversation_assigned", {
        conversation_id: id,
        assigned_to: normalizedAgentId,
      });
      res.json({ success: true, conversation: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.patch(
  "/api/conversations/:id/meta",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;
    const payload: any = {};

    if (typeof req.body?.status === "string") {
      const status = req.body.status.trim().toLowerCase();
      if (!["open", "archived", "closed"].includes(status)) {
        return res.status(400).json({ error: "Invalid conversation status" });
      }
      payload.status = status;
    }

    if (Array.isArray(req.body?.labels)) {
      payload.labels = req.body.labels
        .map((label: any) =>
          String(label || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
        .slice(0, 20);
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "No conversation fields provided" });
    }

    try {
      const { data, error } = await supabase
        .from("w_conversations")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id, status, labels")
        .maybeSingle();

      if (error) throw error;
      if (!data)
        return res.status(404).json({ error: "Conversation not found" });

      io.to(`org:${orgId}`).emit("conversation_updated", data);
      res.json({ success: true, conversation: data });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err.message || "Failed to update conversation" });
    }
  },
);

app.post(
  "/api/conversations/:id/unread",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
      const { data: conv, error: convErr } = await supabase
        .from("w_conversations")
        .select("id")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv)
        return res.status(404).json({ error: "Conversation not found" });

      const { data: latestInbound, error: msgErr } = await supabase
        .from("w_messages")
        .select("id")
        .eq("conversation_id", id)
        .in("direction", ["inbound", "in"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (msgErr) throw msgErr;

      if (latestInbound?.id) {
        const { error: updErr } = await supabase
          .from("w_messages")
          .update({ status: "delivered" })
          .eq("id", latestInbound.id);
        if (updErr) throw updErr;
      }

      await supabase
        .from("w_conversations")
        .update({ unread_count: 1 })
        .eq("id", id)
        .eq("organization_id", orgId);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to mark unread" });
    }
  },
);

app.post(
  "/api/conversations/:id/clear",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
      const { data: conv, error: convErr } = await supabase
        .from("w_conversations")
        .select("id")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv)
        return res.status(404).json({ error: "Conversation not found" });

      const { error: deleteErr } = await supabase
        .from("w_messages")
        .delete()
        .eq("conversation_id", id);
      if (deleteErr) throw deleteErr;

      const { data: updated, error: updateErr } = await supabase
        .from("w_conversations")
        .update({
          last_message_preview: "No messages",
          unread_count: 0,
        })
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id, last_message_preview, unread_count")
        .maybeSingle();
      if (updateErr) throw updateErr;

      io.to(`org:${orgId}`).emit("conversation_cleared", {
        conversation_id: id,
      });
      res.json({ success: true, conversation: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to clear chat" });
    }
  },
);

app.delete("/api/conversations/:id", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  const { id } = req.params;

  try {
    const { data: conv, error: convErr } = await supabase
      .from("w_conversations")
      .select("id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (convErr) throw convErr;
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const { error: msgErr } = await supabase
      .from("w_messages")
      .delete()
      .eq("conversation_id", id);
    if (msgErr) throw msgErr;

    const { error: deleteErr } = await supabase
      .from("w_conversations")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);
    if (deleteErr) throw deleteErr;

    io.to(`org:${orgId}`).emit("conversation_deleted", { conversation_id: id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete chat" });
  }
});

// ====== Flow Builder API ======
app.get("/api/flows", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const { data, error } = await supabase
      .from("w_flows")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/flows/:id", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const { data, error } = await supabase
      .from("w_flows")
      .select("*")
      .eq("id", req.params.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Flow not found" });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/flows", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
    const triggerKeywords = getFlowTriggerKeywords(
      { ...req.body, nodes },
      nodes,
    );
    const waAccountScope = normalizeFlowAccountScope(
      req.body?.wa_account_scope,
    );
    const waAccountIds =
      waAccountScope === "selected"
        ? normalizeFlowAccountIds(req.body?.wa_account_ids)
        : [];
    const payload = {
      name: String(req.body?.name || "").trim(),
      description: req.body?.description || null,
      status:
        req.body?.status === "active" ? "draft" : req.body?.status || "draft",
      trigger_type: req.body?.trigger_type || "keyword",
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
    if (!payload.name)
      return res.status(400).json({ error: "Flow name is required" });
    await enforcePlanResourceLimit({
      organization_id: orgId,
      resource: "flows",
      table: "w_flows",
      filters: { status: ["draft", "active", "paused"] },
      label: "Flow",
    });
    const { data, error } = await supabase
      .from("w_flows")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message, limit: e.limit });
  }
});

app.put("/api/flows/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const orgId = req.organization_id;
  try {
    const updateData: any = {};
    if (req.body.name !== undefined)
      updateData.name = String(req.body.name || "").trim();
    if (req.body.description !== undefined)
      updateData.description = req.body.description || null;
    if (req.body.nodes !== undefined)
      updateData.nodes = Array.isArray(req.body.nodes) ? req.body.nodes : [];
    if (req.body.edges !== undefined)
      updateData.edges = Array.isArray(req.body.edges) ? req.body.edges : [];
    if (req.body.trigger_type !== undefined)
      updateData.trigger_type = req.body.trigger_type || "keyword";
    if (
      req.body.wa_account_scope !== undefined ||
      req.body.wa_account_ids !== undefined
    ) {
      updateData.wa_account_scope = normalizeFlowAccountScope(
        req.body.wa_account_scope,
      );
      updateData.wa_account_ids =
        updateData.wa_account_scope === "selected"
          ? normalizeFlowAccountIds(req.body.wa_account_ids)
          : [];
    }
    if (
      req.body.status !== undefined &&
      ["draft", "paused", "archived"].includes(req.body.status)
    )
      updateData.status = req.body.status;
    if (
      updateData.nodes !== undefined ||
      req.body.triggers !== undefined ||
      req.body.trigger_keywords !== undefined
    ) {
      const nodes =
        updateData.nodes !== undefined ? updateData.nodes : req.body.nodes;
      const triggerKeywords = getFlowTriggerKeywords(
        { ...req.body, nodes },
        nodes,
      );
      updateData.trigger_keywords = triggerKeywords;
      updateData.triggers = triggerKeywords;
    }
    updateData.updated_at = new Date().toISOString();
    updateData.updated_by_user_id = req.user?.id || null;

    const { data, error } = await supabase
      .from("w_flows")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Flow not found" });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/flows/:id/validate", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const { data: flow, error } = await supabase
      .from("w_flows")
      .select("*")
      .eq("id", req.params.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    res.json(validateFlowDefinition(flow));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/flows/:id/publish", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const { data: flow, error } = await supabase
      .from("w_flows")
      .select("*")
      .eq("id", req.params.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!flow) return res.status(404).json({ error: "Flow not found" });

    const validation = validateFlowDefinition(flow);
    if (!validation.valid)
      return res
        .status(400)
        .json({ error: "Flow validation failed", validation });

    const { data: latestVersion } = await supabase
      .from("w_flow_versions")
      .select("version_number")
      .eq("flow_id", flow.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const versionNumber = Number(latestVersion?.version_number || 0) + 1;
    const triggerKeywords = getFlowTriggerKeywords(flow, flow.nodes || []);
    const conflicts = await findFlowTriggerConflicts(
      orgId,
      flow,
      triggerKeywords,
    );
    if (conflicts.length > 0) {
      const validation = {
        valid: false,
        errors: conflicts.map(
          (item: any) =>
            `Trigger "${item.triggers.join(", ")}" is already used by active flow "${item.flow.name}" on an overlapping WhatsApp account.`,
        ),
      };
      return res
        .status(400)
        .json({ error: "Flow trigger conflict", validation });
    }

    const { data: version, error: versionErr } =
      await insertFlowVersionWithSchemaFallback({
        organization_id: orgId,
        flow_id: flow.id,
        version_number: versionNumber,
        nodes: flow.nodes || [],
        edges: flow.edges || [],
        trigger_type: flow.trigger_type || "keyword",
        trigger_keywords: triggerKeywords,
        wa_account_scope: normalizeFlowAccountScope(flow.wa_account_scope),
        wa_account_ids: normalizeFlowAccountIds(flow.wa_account_ids),
        status: "published",
        validation_errors: [],
        published_by_user_id: req.user?.id || null,
      });
    if (versionErr) throw versionErr;

    const { data: updated, error: updateErr } = await supabase
      .from("w_flows")
      .update({
        status: "active",
        current_version_id: version.id,
        trigger_keywords: triggerKeywords,
        triggers: triggerKeywords,
        updated_at: new Date().toISOString(),
        updated_by_user_id: req.user?.id || null,
      })
      .eq("id", flow.id)
      .eq("organization_id", orgId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    res.json({ success: true, flow: updated, version });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/flows/:id/runs", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const { data, error } = await supabase
      .from("w_flow_runs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("flow_id", req.params.id)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/flow-runs/:id", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    const { data: run, error } = await supabase
      .from("w_flow_runs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!run) return res.status(404).json({ error: "Flow run not found" });
    const { data: steps, error: stepErr } = await supabase
      .from("w_flow_run_steps")
      .select("*")
      .eq("organization_id", orgId)
      .eq("run_id", run.id)
      .order("started_at", { ascending: true });
    if (stepErr) throw stepErr;
    res.json({ ...run, steps: steps || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/flows/:id", authMiddleware, async (req: any, res) => {
  try {
    const { error } = await supabase
      .from("w_flows")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("organization_id", req.organization_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function isTemplateStarsMissingError(error: any) {
  const value = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ");
  return value.includes("42P01") || value.includes("w_flow_template_stars");
}

app.get("/api/flow-template-stars", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from("w_flow_template_stars")
      .select("template_id,user_id");
    if (error) throw error;

    const stats: Record<string, { stars: number; starred: boolean }> = {};
    for (const row of data || []) {
      const templateId = String(row.template_id || "");
      if (!templateId) continue;
      if (!stats[templateId]) stats[templateId] = { stars: 0, starred: false };
      stats[templateId].stars += 1;
      if (row.user_id === userId) stats[templateId].starred = true;
    }

    res.json(stats);
  } catch (e: any) {
    if (isTemplateStarsMissingError(e)) {
      console.warn(
        "[FlowTemplateStars] Table unavailable while reading stats:",
        e?.message || e,
      );
      return res.json({});
    }
    console.error("[FlowTemplateStars] Failed to read stats:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post(
  "/api/flow-template-stars/:templateId",
  authMiddleware,
  async (req: any, res) => {
    try {
      const templateId = String(req.params.templateId || "").trim();
      if (!templateId)
        return res.status(400).json({ error: "templateId is required" });

      const userId = req.user.id;
      const orgId = req.organization_id;
      if (!orgId)
        return res.status(400).json({ error: "organization_id is required" });

      const { data: existing, error: lookupError } = await supabase
        .from("w_flow_template_stars")
        .select("id")
        .eq("template_id", templateId)
        .eq("user_id", userId)
        .maybeSingle();
      if (lookupError) throw lookupError;

      let starred = false;
      if (existing?.id) {
        const { error } = await supabase
          .from("w_flow_template_stars")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("w_flow_template_stars")
          .insert({
            template_id: templateId,
            user_id: userId,
            organization_id: orgId,
          });
        if (error) throw error;
        starred = true;
      }

      const { count, error: countError } = await supabase
        .from("w_flow_template_stars")
        .select("id", { count: "exact", head: true })
        .eq("template_id", templateId);
      if (countError) throw countError;

      res.json({ template_id: templateId, stars: count || 0, starred });
    } catch (e: any) {
      if (isTemplateStarsMissingError(e)) {
        console.warn(
          "[FlowTemplateStars] Table unavailable while updating star:",
          e?.message || e,
        );
        return res.json({
          template_id: String(req.params.templateId || "").trim(),
          stars: 0,
          starred: false,
          disabled: true,
        });
      }
      console.error("[FlowTemplateStars] Failed to update star:", e);
      res.status(500).json({ error: e.message });
    }
  },
);

// ====== Bot Agents API ======
// Get all bot agents for an organization
app.get("/api/agents", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;

  try {
    let query = supabase
      .from("bot_agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    const { data, error } = await query;
    if (error) {
      // Check if table doesn't exist
      if (
        error.message?.includes("relation") &&
        error.message?.includes("does not exist")
      ) {
        console.error(
          "bot_agents table does not exist. Please run the migration.",
        );
        return res.status(500).json({
          error:
            'Database table "bot_agents" not found. Please run the migration: supabase/migrations/20260127100000_add_bot_agents_and_conversation_bot_settings.sql',
        });
      }
      throw error;
    }

    res.json(data || []);
  } catch (err: any) {
    console.error("Error fetching agents:", err);
    res.status(500).json({ error: err.message || "Failed to fetch agents" });
  }
});

// Create a new bot agent
app.post("/api/agents", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const {
      name,
      description,
      model = "gpt-3.5-turbo",
      temperature = 0.7,
      trigger_keywords = [],
      system_prompt,
      is_active = true,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Agent name is required" });
    }

    await enforcePlanResourceLimit({
      organization_id,
      resource: "ai_agents",
      table: "bot_agents",
      label: "AI agent",
    });

    const knowledgePayload = await buildAgentKnowledgePayload(
      organization_id,
      req.body || {},
    );

    const { data, error } = await supabase
      .from("bot_agents")
      .insert({
        organization_id,
        name,
        description,
        model,
        temperature,
        trigger_keywords,
        system_prompt,
        knowledge_base: knowledgePayload.knowledge_base,
        knowledge_base_content: knowledgePayload.knowledge_base_content,
        is_active,
      })
      .select()
      .single();

    if (error) {
      // Check if table doesn't exist
      if (
        error.message?.includes("relation") &&
        error.message?.includes("does not exist")
      ) {
        console.error(
          "bot_agents table does not exist. Please run the migration.",
        );
        return res.status(500).json({
          error:
            'Database table "bot_agents" not found. Please run the migration first.',
        });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (err: any) {
    console.error("Error creating agent:", err);
    res
      .status(err.statusCode || 500)
      .json({
        error: err.message || "Failed to create agent",
        limit: err.limit,
      });
  }
});

// Update a bot agent
app.patch("/api/agents/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    const updateData: any = {};
    const allowedFields = [
      "name",
      "description",
      "model",
      "temperature",
      "trigger_keywords",
      "system_prompt",
      "is_active",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (
      req.body.selected_knowledge_document_ids !== undefined ||
      req.body.knowledge_base !== undefined ||
      req.body.knowledge_base_content !== undefined ||
      req.body.automation_settings !== undefined
    ) {
      const knowledgePayload = await buildAgentKnowledgePayload(
        organization_id,
        req.body || {},
      );
      updateData.knowledge_base = knowledgePayload.knowledge_base;
      updateData.knowledge_base_content =
        knowledgePayload.knowledge_base_content;
    }

    let query = supabase.from("bot_agents").update(updateData).eq("id", id);

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    const { data, error } = await query.select().single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Agent not found" });

    res.json(data);
  } catch (err: any) {
    console.error("Error updating agent:", err);
    res.status(500).json({ error: err.message || "Failed to update agent" });
  }
});

// Delete a bot agent
app.delete("/api/agents/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const organization_id = req.organization_id;

  try {
    let query = supabase.from("bot_agents").delete().eq("id", id);

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    const { error } = await query;

    if (error) throw error;

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting agent:", err);
    res.status(500).json({ error: err.message || "Failed to delete agent" });
  }
});

// Toggle AI-agent fallback for a specific conversation. Flow Builder remains active.
app.patch(
  "/api/conversations/:id/bot",
  authMiddleware,
  async (req: any, res) => {
    const { id } = req.params;
    const orgId = req.organization_id;
    const { bot_enabled, assigned_bot_id } = req.body;

    try {
      const updateData: any = {};
      if (typeof bot_enabled === "boolean") {
        updateData.bot_enabled = bot_enabled;
      }
      if (assigned_bot_id !== undefined) {
        updateData.assigned_bot_id = assigned_bot_id || null;
      }

      const { data, error } = await supabase
        .from("w_conversations")
        .update(updateData)
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id, bot_enabled, assigned_bot_id")
        .maybeSingle();

      if (error) throw error;
      if (!data)
        return res.status(404).json({ error: "Conversation not found" });

      io.to(`org:${orgId}`).emit("conversation_bot_updated", {
        conversation_id: id,
        ...data,
      });
      res.json(data);
    } catch (err: any) {
      console.error("Error updating conversation bot settings:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to update bot settings" });
    }
  },
);

// Get OpenAI settings
app.get("/api/settings/openai", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    const { data, error } = await supabase
      .from("openai_settings")
      .select("id, organization_id, created_at, updated_at")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (error) throw error;

    res.json({
      configured: !!data,
      hasEnvKey: !!process.env.OPENAI_API_KEY,
    });
  } catch (err: any) {
    console.error("Error fetching OpenAI settings:", err);
    res.status(500).json({ error: err.message || "Failed to fetch settings" });
  }
});

// Save OpenAI API key
app.post("/api/settings/openai", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;
  const { api_key } = req.body;

  try {
    if (!organization_id) {
      return res.status(400).json({ error: "organization_id is required" });
    }

    if (!api_key) {
      return res.status(400).json({ error: "API key is required" });
    }

    // In production, encrypt this key before storing
    const { data, error } = await supabase
      .from("openai_settings")
      .upsert(
        {
          organization_id,
          api_key_encrypted: api_key, // TODO: Encrypt this!
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      )
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error saving OpenAI settings:", err);
    res.status(500).json({ error: err.message || "Failed to save settings" });
  }
});

// Get Auto Assign settings
app.get("/api/settings/auto-assign", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;

  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", organization_id)
      .single();

    if (error) throw error;

    const autoAssignSettings = data?.settings?.auto_assign || {
      enabled: false,
      batch_size: 1,
      paused_agents: [],
      state: { last_agent_id: null, current_batch_count: 0 },
    };

    res.json(autoAssignSettings);
  } catch (err: any) {
    console.error("Error fetching auto assign settings:", err);
    res.status(500).json({ error: err.message || "Failed to fetch settings" });
  }
});

// Update Auto Assign settings
app.post("/api/settings/auto-assign", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;
  const { enabled, batch_size, paused_agents } = req.body;

  try {
    const { data: orgData, error: fetchErr } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", organization_id)
      .single();

    if (fetchErr) throw fetchErr;

    const currentSettings = orgData?.settings || {};
    const currentAutoAssign = currentSettings.auto_assign || {};

    const newAutoAssign = {
      ...currentAutoAssign,
      enabled:
        enabled !== undefined ? enabled : currentAutoAssign.enabled || false,
      batch_size:
        batch_size !== undefined
          ? Math.max(1, batch_size)
          : currentAutoAssign.batch_size || 1,
      paused_agents:
        paused_agents !== undefined
          ? paused_agents
          : currentAutoAssign.paused_agents || [],
    };

    const { data, error } = await supabase
      .from("organizations")
      .update({ settings: { ...currentSettings, auto_assign: newAutoAssign } })
      .eq("id", organization_id)
      .select("settings")
      .single();

    if (error) throw error;

    res.json(data.settings.auto_assign);
  } catch (err: any) {
    console.error("Error updating auto assign settings:", err);
    res.status(500).json({ error: err.message || "Failed to update settings" });
  }
});

// Get organization agents for the UI
app.get("/api/team/agents", authMiddleware, async (req: any, res) => {
  const organization_id = req.organization_id;

  try {
    const { data, error } = await supabase
      .from("organization_members")
      .select("user_id, name, email, role, is_active")
      .eq("organization_id", organization_id)
      .eq("role", "agent")
      .eq("is_active", true);

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    console.error("Error fetching agents for auto assign:", err);
    res.status(500).json({ error: err.message || "Failed to fetch agents" });
  }
});

app.get(
  "/api/messages/:conversationId",
  authMiddleware,
  async (req: any, res) => {
    const { conversationId } = req.params;
    const orgId = req.organization_id;
    try {
      const rawLimit = Number(req.query.limit || 50);
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(200, rawLimit))
        : 50;
      const before =
        typeof req.query.before === "string" ? req.query.before : null;

      // Fetch newest first for efficient pagination, then reverse to keep UI stable ASC.
      let query = supabase
        .from("w_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (before) {
        // Expect ISO timestamp string
        query = query.lt("created_at", before);
      }

      const { data, error } = await query;

      if (error) throw error;
      const rows = Array.isArray(data) ? [...data].reverse() : [];
      res.json(rows);
    } catch (err: any) {
      console.error("Error fetching messages:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

app.get(
  "/api/conversations/:id/summary",
  authMiddleware,
  async (req: any, res) => {
    const conversationId = req.params.id;
    const orgId = req.organization_id;
    try {
      const { data: conversation, error: convErr } = await supabase
        .from("w_conversations")
        .select(
          "id, handoff_status, handoff_reason, handoff_requested_at, summary_status, latest_summary_id",
        )
        .eq("id", conversationId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });

      const { data: summary, error: summaryErr } = await supabase
        .from("w_conversation_summaries")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (summaryErr) throw summaryErr;

      const { data: notes, error: notesErr } = await supabase
        .from("w_conversation_notes")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (notesErr) throw notesErr;

      res.json({ conversation, summary: summary || null, notes: notes || [] });
    } catch (err: any) {
      console.error("Error fetching conversation summary:", err);
      res.status(500).json({ error: err.message || "Failed to fetch summary" });
    }
  },
);

app.post(
  "/api/conversations/:id/request-summary",
  authMiddleware,
  async (req: any, res) => {
    const conversationId = req.params.id;
    const orgId = req.organization_id;

    try {
      const { data: conversation, error: convErr } = await supabase
        .from("w_conversations")
        .select("id, organization_id, contact_id, handoff_status")
        .eq("id", conversationId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });
      if (!N8N_HANDOFF_WEBHOOK_URL) {
        return res
          .status(400)
          .json({ error: "N8N_HANDOFF_WEBHOOK_URL is not configured" });
      }

      await supabase
        .from("w_conversations")
        .update({
          summary_status: "pending",
          handoff_status:
            conversation.handoff_status === "bot_active"
              ? "handoff_requested"
              : conversation.handoff_status,
          handoff_reason: "Manual summary requested",
          handoff_requested_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
        .eq("organization_id", orgId);

      await triggerHandoffWebhook({
        event: "manual_summary_requested",
        organization_id: orgId,
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        handoff_reason: "Manual summary requested",
        requested_by_user_id: req.user?.id || null,
        summary_required: true,
      });

      const { data: latestConversation } = await supabase
        .from("w_conversations")
        .select(
          "id, handoff_status, handoff_reason, handoff_requested_at, summary_status, latest_summary_id",
        )
        .eq("id", conversationId)
        .eq("organization_id", orgId)
        .maybeSingle();

      io.to(`org:${orgId}`).emit("conversation_summary_updated", {
        conversation_id: conversationId,
        summary_status: latestConversation?.summary_status || "pending",
      });

      res.json({ success: true, conversation: latestConversation || null });
    } catch (err: any) {
      console.error("[n8n] Error requesting summary:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to request summary" });
    }
  },
);

app.post(
  "/api/n8n/conversations/:conversationId/summary",
  async (req: any, res) => {
    const conversationId = String(req.params.conversationId || "").trim();
    const providedSecret = String(
      req.headers["x-n8n-secret"] || req.body?.secret || "",
    );

    if (N8N_WEBHOOK_SECRET && providedSecret !== N8N_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid n8n secret" });
    }

    try {
      const { data: conversation, error: convErr } = await supabase
        .from("w_conversations")
        .select("id, organization_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });

      const body = req.body || {};
      const summaryText = String(
        body.summary_text || body.summary || body.conversation_summary || "",
      ).trim();
      if (!summaryText)
        return res.status(400).json({ error: "summary_text is required" });

      const asArray = (value: any) => {
        if (Array.isArray(value)) return value;
        if (value == null || value === "") return [];
        return [value];
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("w_conversation_summaries")
        .insert({
          organization_id: conversation.organization_id,
          conversation_id: conversationId,
          summary_text: summaryText,
          customer_intent: body.customer_intent || body.intent || null,
          customer_stage: body.customer_stage || body.stage || null,
          lead_quality: body.lead_quality || body.quality || null,
          next_best_action: body.next_best_action || body.next_action || null,
          open_questions: asArray(body.open_questions),
          important_facts: asArray(body.important_facts || body.key_facts),
          objections: asArray(body.objections),
          products_discussed: asArray(body.products_discussed || body.products),
          summary_from_message_id: body.summary_from_message_id || null,
          summary_to_message_id: body.summary_to_message_id || null,
          generated_by: body.generated_by || "n8n",
          model: body.model || null,
          metadata:
            body.metadata && typeof body.metadata === "object"
              ? body.metadata
              : {},
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      await supabase
        .from("w_conversations")
        .update({
          latest_summary_id: inserted.id,
          summary_status: "ready",
        })
        .eq("id", conversationId)
        .eq("organization_id", conversation.organization_id);

      await supabase.from("w_conversation_notes").insert({
        organization_id: conversation.organization_id,
        conversation_id: conversationId,
        note_type: "ai_summary",
        body: summaryText,
        source: "n8n",
        metadata: { summary_id: inserted.id },
      });

      io.to(`org:${conversation.organization_id}`).emit(
        "conversation_summary_updated",
        {
          conversation_id: conversationId,
          summary: inserted,
          summary_status: "ready",
        },
      );

      res.json({ success: true, summary: inserted });
    } catch (err: any) {
      console.error("[n8n] Error saving summary:", err);
      res.status(500).json({ error: err.message || "Failed to save summary" });
    }
  },
);

// Alias for required route shape
app.get(
  "/api/conversations/:id/messages",
  authMiddleware,
  async (req: any, res) => {
    const conversationId = req.params.id;
    const orgId = req.organization_id;
    try {
      const rawLimit = Number(req.query.limit || 50);
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(200, rawLimit))
        : 50;
      const before =
        typeof req.query.before === "string" ? req.query.before : null;

      let query = supabase
        .from("w_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt("created_at", before);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = Array.isArray(data) ? [...data].reverse() : [];
      res.json(rows);
    } catch (err: any) {
      console.error("Error fetching conversation messages:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

app.post(
  "/api/messages/:messageId/reaction",
  authMiddleware,
  async (req: any, res) => {
    const { messageId } = req.params;
    const orgId = req.organization_id;
    const rawEmoji =
      typeof req.body?.emoji === "string" ? req.body.emoji.trim() : null;
    const emoji = rawEmoji || null;
    const actor = req.user?.id || req.user?.email || "dashboard";

    try {
      const { data: message, error: msgErr } = await supabase
        .from("w_messages")
        .select(
          "id, organization_id, conversation_id, wa_message_id, reactions",
        )
        .eq("id", messageId)
        .eq("organization_id", orgId)
        .single();

      if (msgErr) throw msgErr;
      if (!message) return res.status(404).json({ error: "Message not found" });
      if (!message.wa_message_id)
        return res
          .status(400)
          .json({
            error:
              "This message cannot be reacted to yet. WhatsApp message id is missing.",
          });

      const { data: conv, error: convErr } = await supabase
        .from("w_conversations")
        .select(
          `
                id,
                organization_id,
                contact:w_contacts(id, wa_id, phone),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `,
        )
        .eq("id", message.conversation_id)
        .eq("organization_id", orgId)
        .single();

      if (convErr) throw convErr;
      if (!conv?.contact?.wa_id && !conv?.contact?.phone) {
        return res
          .status(400)
          .json({ error: "Conversation contact is missing phone number" });
      }
      if (!conv?.account?.phone_number_id) {
        return res
          .status(400)
          .json({ error: "Conversation account is missing phone number id" });
      }

      const nextReactions = applyReactionUpdate(
        message.reactions,
        emoji,
        actor,
      );
      const toMeta = normalizeWaIdToPhone(
        String(conv.contact.wa_id || conv.contact.phone || ""),
      );
      if (!toMeta)
        return res
          .status(400)
          .json({ error: "Invalid recipient phone number" });

      if (conv.account.access_token_encrypted) {
        await sendReactionMessage(
          toMeta,
          message.wa_message_id,
          emoji,
          String(conv.account.phone_number_id),
        );
      } else {
        return res
          .status(409)
          .json({
            error:
              "Reactions are currently available for Cloud API connected accounts.",
          });
      }

      const { error: updErr } = await supabase
        .from("w_messages")
        .update({ reactions: nextReactions })
        .eq("id", message.id)
        .eq("organization_id", orgId);

      if (updErr) throw updErr;

      io.emit("message_updated", {
        conversation_id: message.conversation_id,
        message_id: message.id,
        wa_message_id: message.wa_message_id,
        reactions: nextReactions,
      });

      res.json({ success: true, reactions: nextReactions });
    } catch (err: any) {
      console.error("Reaction update error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to update reaction" });
    }
  },
);

// Send Message (Outbound) - used by LiveChat UI
app.post(
  "/api/conversations/:conversationId/send",
  authMiddleware,
  async (req: any, res) => {
    const { conversationId } = req.params;
    const orgId = req.organization_id;
    const {
      text,
      session_id,
      reply_to_message_id,
      forward_from_message_id,
      client_message_id,
    } = req.body as {
      text?: string;
      session_id?: string;
      reply_to_message_id?: string;
      forward_from_message_id?: string;
      client_message_id?: string;
    };

    if (!text || !text.trim())
      return res.status(400).json({ error: "Text required" });

    try {
      const { data: conv, error: convErr } = await supabase
        .from("w_conversations")
        .select(
          `
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `,
        )
        .eq("id", conversationId)
        .eq("organization_id", orgId)
        .single();

      if (convErr) throw convErr;
      if (!conv?.contact?.wa_id)
        throw new Error("Conversation contact missing wa_id");
      if (!conv?.account?.phone_number_id)
        throw new Error("Conversation account missing phone_number_id");

      if (!orgId) throw new Error("Organization not configured");

      const toPhone = String(conv.contact.wa_id);
      const accountPhoneOrId = String(conv.account.phone_number_id);

      // 1) Send via Meta Cloud API if token exists, otherwise via Baileys
      let sendResult: any = null;
      let wa_message_id: string | null = null;
      if (conv.account.access_token_encrypted) {
        const toMeta = normalizeWaIdToPhone(toPhone);
        if (!toMeta)
          throw new Error(
            "Meta send requires a numeric recipient phone number",
          );
        sendResult = await sendTextMessage(
          toMeta,
          text,
          accountPhoneOrId,
          reply_to_message_id || null,
        ); // sendTextMessage already decrypts internally
        wa_message_id = sendResult?.messages?.[0]?.id || null;
      } else {
        // Baileys
        const sock = session_id ? sessions.get(session_id) : null;
        let resolvedSock = sock;
        if (!resolvedSock) {
          // Fallback: try to find an active session whose connected phone matches this account
          for (const s of sessions.values()) {
            const connectedJid = s?.user?.id || "";
            const connectedPhone = connectedJid
              ? connectedJid.split(":")[0]
              : "";
            if (connectedPhone && connectedPhone === accountPhoneOrId) {
              resolvedSock = s;
              break;
            }
          }
        }

        if (!resolvedSock) {
          throw new Error(
            "No active Baileys session found for this account. Reconnect via QR.",
          );
        }

        // Bail out early if the session isn't fully connected yet.
        // This prevents Baileys internals from crashing when auth/user state is not ready.
        if (!resolvedSock?.user?.id) {
          return res.status(409).json({
            error:
              "WhatsApp session is not connected yet. Click Generate QR and connect, then try again.",
          });
        }

        const normalizeForBaileys = (raw: string) => {
          const v = String(raw || "").trim();
          if (!v) return null;
          if (v.includes("@")) return v;
          const digits = v.replace(/[^0-9]/g, "");
          if (!digits) return null;
          return `${digits}@s.whatsapp.net`;
        };

        const jid = normalizeForBaileys(toPhone);
        if (!jid) throw new Error("Invalid recipient wa_id for Baileys");
        sendResult = await resolvedSock.sendMessage(jid, { text });
        wa_message_id = sendResult?.key?.id || null;
      }

      let quotedMessage: any = null;
      if (reply_to_message_id) {
        const { data: quotedMsg } = await supabase
          .from("w_messages")
          .select("id, text_body, type, content, wa_message_id, direction")
          .eq("wa_message_id", reply_to_message_id)
          .maybeSingle();
        quotedMessage = {
          wa_message_id: reply_to_message_id,
          text: quotedMsg?.text_body || quotedMsg?.content?.text || null,
          type: quotedMsg?.type || "text",
          direction: quotedMsg?.direction || null,
          found: !!quotedMsg,
        };
      }

      // 2) Store in DB (with wa_message_id so status updates can match)
      const stored = await storeMessage({
        organization_id: orgId,
        contact_id: conv.contact.id,
        conversation_id: conv.id,
        wa_message_id,
        direction: "outbound",
        type: "text",
        content: {
          text,
          quoted: quotedMessage,
          forwarded: !!forward_from_message_id,
          client_message_id: client_message_id || null,
        },
        status: "sent",
        sender_type: "human_agent",
        sender_user_id: (req as any).user?.id || null,
        automation_source: "manual",
      } as any);

      // 3) Update conversation preview/unread
      await upsertConversation(orgId, conv.wa_account_id, conv.contact.id, {
        direction: "outbound",
        preview: text,
      });

      // 4) Emit to frontend (minimal patch payload)
      io.emit("new_message", {
        from: toPhone,
        text,
        quoted: quotedMessage,
        sender: "agent",
        conversation_id: conv.id,
        contact_id: conv.contact.id,
        message_id: stored?.id || null,
        wa_message_id,
        client_message_id: client_message_id || null,
        created_at: stored?.created_at || new Date().toISOString(),
        status: "sent",
        content: {
          text,
          quoted: quotedMessage,
          forwarded: !!forward_from_message_id,
          client_message_id: client_message_id || null,
        },
      });

      res.json({
        success: true,
        result: sendResult,
        message: {
          id: stored?.id || null,
          wa_message_id,
          created_at: stored?.created_at || null,
          conversation_id: conv.id,
          contact_id: conv.contact.id,
          direction: "outbound",
          type: "text",
          content: {
            text,
            quoted: quotedMessage,
            forwarded: !!forward_from_message_id,
            client_message_id: client_message_id || null,
          },
          status: "sent",
        },
      });
    } catch (err: any) {
      console.error("Send message error:", err);
      res.status(500).json({ error: err.message || "Failed to send" });
    }
  },
);

// Send Media (Outbound) - used by LiveChat UI (image/video/audio/document)
app.post(
  "/api/conversations/:conversationId/send-media",
  upload.single("file"),
  async (req, res) => {
    const { conversationId } = req.params;
    const caption = String(req.body?.caption || "").trim();
    const session_id = String(req.body?.session_id || "");
    const duration_seconds_raw = req.body?.duration_seconds;
    const duration_seconds =
      duration_seconds_raw != null && duration_seconds_raw !== ""
        ? Number(duration_seconds_raw)
        : null;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) return res.status(400).json({ error: "file required" });

    try {
      const { data: conv, error: convErr } = await supabase
        .from("w_conversations")
        .select(
          `
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name, phone),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `,
        )
        .eq("id", conversationId)
        .single();

      if (convErr) throw convErr;
      if (!conv?.contact?.wa_id)
        throw new Error("Conversation contact missing wa_id");
      if (!conv?.account?.phone_number_id)
        throw new Error("Conversation account missing phone_number_id");

      const orgId = conv.organization_id;
      if (!orgId) throw new Error("Organization not configured");

      const mimeType = file.mimetype || "application/octet-stream";
      const fileName = file.originalname || "file";

      // Store media in Supabase Storage (always)
      const uploaded = await uploadMediaToStorage({
        organization_id: orgId,
        conversation_id: conv.id,
        fileName,
        mimeType,
        buffer: file.buffer,
      });

      let msgType: "image" | "video" | "audio" | "document" = "document";
      if (mimeType.startsWith("image/")) msgType = "image";
      else if (mimeType.startsWith("video/")) msgType = "video";
      else if (mimeType.startsWith("audio/")) msgType = "audio";

      const preview =
        caption ||
        (msgType === "image"
          ? "[Image]"
          : msgType === "video"
            ? "[Video]"
            : msgType === "audio"
              ? "[Audio]"
              : "[Document]");

      let wa_message_id: string | null = null;
      let sendRaw: any = null;

      if (conv.account.access_token_encrypted) {
        const toMeta = normalizeWaIdToPhone(conv.contact.wa_id);
        if (!toMeta)
          throw new Error(
            "Meta send requires a numeric recipient phone number",
          );

        const token = conv.account.access_token_encrypted;
        const sent = await sendMediaMessageMeta({
          phone_number_id: String(conv.account.phone_number_id),
          to: toMeta,
          token,
          buffer: file.buffer,
          mimeType,
          fileName,
          type: msgType,
          caption: caption || undefined,
        });
        wa_message_id = sent.wa_message_id;
        sendRaw = sent.raw;
      } else {
        // Baileys
        const accountPhoneOrId = String(conv.account.phone_number_id);
        const sock = session_id ? sessions.get(session_id) : null;
        let resolvedSock = sock;
        if (!resolvedSock) {
          for (const s of sessions.values()) {
            const connectedJid = s?.user?.id || "";
            const connectedPhone = connectedJid
              ? connectedJid.split(":")[0]
              : "";
            if (connectedPhone && connectedPhone === accountPhoneOrId) {
              resolvedSock = s;
              break;
            }
          }
        }
        if (!resolvedSock)
          throw new Error(
            "No active Baileys session found for this account. Reconnect via QR.",
          );

        const jid = conv.contact.wa_id.includes("@")
          ? conv.contact.wa_id
          : `${conv.contact.wa_id}@s.whatsapp.net`;
        let result: any = null;
        if (msgType === "image")
          result = await resolvedSock.sendMessage(jid, {
            image: file.buffer,
            caption: caption || undefined,
          });
        else if (msgType === "video")
          result = await resolvedSock.sendMessage(jid, {
            video: file.buffer,
            caption: caption || undefined,
          });
        else if (msgType === "audio")
          result = await resolvedSock.sendMessage(jid, {
            audio: file.buffer,
            mimetype: mimeType,
          });
        else
          result = await resolvedSock.sendMessage(jid, {
            document: file.buffer,
            fileName,
            mimetype: mimeType,
            caption: caption || undefined,
          });

        wa_message_id = result?.key?.id || null;
        sendRaw = result;
      }

      const stored = await storeMessage({
        organization_id: orgId,
        contact_id: conv.contact.id,
        conversation_id: conv.id,
        wa_message_id,
        direction: "outbound",
        type: msgType,
        content: {
          text: caption || null,
          media_url: uploaded.publicUrl,
          mime_type: mimeType,
          file_name: fileName,
          size: file.size,
          duration_seconds:
            msgType === "audio" && Number.isFinite(duration_seconds as any)
              ? Math.max(0, Math.round(duration_seconds as any))
              : null,
          raw_send: sendRaw,
        },
        status: "sent",
        sender_type: "human_agent",
        sender_user_id: (req as any).user?.id || null,
        automation_source: "manual",
      } as any);

      await upsertConversation(orgId, conv.wa_account_id, conv.contact.id, {
        direction: "outbound",
        preview,
      });

      io.emit("new_message", {
        from: conv.contact.wa_id,
        text: caption || preview,
        sender: "agent",
        conversation_id: conv.id,
        contact_id: conv.contact.id,
        message_id: stored?.id || null,
        wa_message_id,
        created_at: stored?.created_at || new Date().toISOString(),
        type: msgType,
        media_url: uploaded.publicUrl,
        mime_type: mimeType,
        file_name: fileName,
        duration_seconds:
          msgType === "audio" && Number.isFinite(duration_seconds as any)
            ? Math.max(0, Math.round(duration_seconds as any))
            : undefined,
        status: "sent",
      });

      res.json({
        success: true,
        wa_message_id,
        media_url: uploaded.publicUrl,
        message: {
          id: stored?.id || null,
          wa_message_id,
          created_at: stored?.created_at || null,
          conversation_id: conv.id,
          contact_id: conv.contact.id,
          direction: "outbound",
          type: msgType,
          content: {
            text: caption || null,
            media_url: uploaded.publicUrl,
            mime_type: mimeType,
            file_name: fileName,
            size: file.size,
            duration_seconds:
              msgType === "audio" && Number.isFinite(duration_seconds as any)
                ? Math.max(0, Math.round(duration_seconds as any))
                : null,
          },
          status: "sent",
        },
      });
    } catch (err: any) {
      console.error("Send media error:", err);
      res.status(500).json({ error: err.message || "Failed to send media" });
    }
  },
);

// Required API: POST /api/messages/audio
// Input: multipart/form-data { conversation_id, file, caption?, session_id?, duration_seconds? }
app.post("/api/messages/audio", upload.single("file"), async (req, res) => {
  const conversationId = String(req.body?.conversation_id || "").trim();
  const caption = String(req.body?.caption || "").trim();
  const session_id = String(req.body?.session_id || "");
  const duration_seconds_raw = req.body?.duration_seconds;
  const duration_seconds =
    duration_seconds_raw != null && duration_seconds_raw !== ""
      ? Number(duration_seconds_raw)
      : null;
  const file = (req as any).file as Express.Multer.File | undefined;

  if (!conversationId)
    return res.status(400).json({ error: "conversation_id required" });
  if (!file) return res.status(400).json({ error: "file required" });

  try {
    const { data: conv, error: convErr } = await supabase
      .from("w_conversations")
      .select(
        `
                id,
                organization_id,
                wa_account_id,
                contact:w_contacts(id, wa_id, name, phone),
                account:w_wa_accounts(id, phone_number_id, access_token_encrypted)
            `,
      )
      .eq("id", conversationId)
      .single();

    if (convErr) throw convErr;
    if (!conv?.contact?.wa_id)
      throw new Error("Conversation contact missing wa_id");
    if (!conv?.account?.phone_number_id)
      throw new Error("Conversation account missing phone_number_id");

    const orgId = conv.organization_id;
    if (!orgId) throw new Error("Organization not configured");

    const mimeType = file.mimetype || "audio/ogg";
    const fileName = file.originalname || `audio-${crypto.randomUUID()}.ogg`;

    const uploaded = await uploadMediaToStorage({
      organization_id: orgId,
      conversation_id: conv.id,
      fileName,
      mimeType,
      buffer: file.buffer,
    });

    // Try to send out via WhatsApp (Meta if available, else Baileys)
    let wa_message_id: string | null = null;
    let sendRaw: any = null;

    if (conv.account.access_token_encrypted) {
      const toMeta = normalizeWaIdToPhone(conv.contact.wa_id);
      if (!toMeta)
        throw new Error("Meta send requires a numeric recipient phone number");

      const token = decryptToken(conv.account.access_token_encrypted);
      const sent = await sendMediaMessageMeta({
        phone_number_id: String(conv.account.phone_number_id),
        to: toMeta,
        token,
        buffer: file.buffer,
        mimeType,
        fileName,
        type: "audio",
      });
      wa_message_id = sent.wa_message_id;
      sendRaw = sent.raw;
    } else {
      const accountPhoneOrId = String(conv.account.phone_number_id);
      const sock = session_id ? sessions.get(session_id) : null;
      let resolvedSock = sock;
      if (!resolvedSock) {
        for (const s of sessions.values()) {
          const connectedJid = s?.user?.id || "";
          const connectedPhone = connectedJid ? connectedJid.split(":")[0] : "";
          if (connectedPhone && connectedPhone === accountPhoneOrId) {
            resolvedSock = s;
            break;
          }
        }
      }
      if (!resolvedSock)
        throw new Error(
          "No active Baileys session found for this account. Reconnect via QR.",
        );

      const jid = conv.contact.wa_id.includes("@")
        ? conv.contact.wa_id
        : `${conv.contact.wa_id}@s.whatsapp.net`;
      const result = await resolvedSock.sendMessage(jid, {
        audio: file.buffer,
        mimetype: mimeType,
      });
      wa_message_id = result?.key?.id || null;
      sendRaw = result;
    }

    const stored = await storeMessage({
      organization_id: orgId,
      contact_id: conv.contact.id,
      conversation_id: conv.id,
      wa_message_id,
      direction: "outbound",
      type: "audio",
      content: {
        text: caption || null,
        media_url: uploaded.publicUrl,
        mime_type: mimeType,
        file_name: fileName,
        size: file.size,
        duration_seconds: Number.isFinite(duration_seconds as any)
          ? Math.max(0, Math.round(duration_seconds as any))
          : null,
        raw_send: sendRaw,
      },
      status: "sent",
      sender_type: "human_agent",
      sender_user_id: (req as any).user?.id || null,
      automation_source: "manual",
    } as any);

    await upsertConversation(orgId, conv.wa_account_id, conv.contact.id, {
      direction: "outbound",
      preview: caption || "[Audio]",
    });

    io.emit("new_message", {
      from: conv.contact.wa_id,
      text: caption || "[Audio]",
      sender: "agent",
      conversation_id: conv.id,
      contact_id: conv.contact.id,
      message_id: stored?.id || null,
      wa_message_id,
      created_at: stored?.created_at || new Date().toISOString(),
      type: "audio",
      media_url: uploaded.publicUrl,
      mime_type: mimeType,
      file_name: fileName,
      duration_seconds: Number.isFinite(duration_seconds as any)
        ? Math.max(0, Math.round(duration_seconds as any))
        : undefined,
      status: "sent",
    });

    res.json({
      success: true,
      message: {
        id: stored?.id || null,
        wa_message_id,
        created_at: stored?.created_at || null,
        conversation_id: conv.id,
        contact_id: conv.contact.id,
        direction: "outbound",
        type: "audio",
        text_body: caption || null,
        media_url: uploaded.publicUrl,
        media_mime: mimeType,
        media_size: file.size,
        duration_seconds: Number.isFinite(duration_seconds as any)
          ? Math.max(0, Math.round(duration_seconds as any))
          : null,
        status: "sent",
      },
    });
  } catch (err: any) {
    console.error("Audio upload error:", err);
    res.status(500).json({ error: err.message || "Failed to send audio" });
  }
});

// Mark as Read (Multi-Agent)
app.post("/api/conversations/:id/read", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body; // Passed from frontend

  // user_id is optional in dev/local setups; we still clear unread + mark messages read.

  try {
    // 1. Get the conversation to find the organization_id (security check/data integrity)
    const { data: conv, error: fetchErr } = await supabase
      .from("w_conversations")
      .select("organization_id, last_message_at") // Get last_message_at to possibly act as "message id" proxy or just use NOW()
      .eq("id", id)
      .single();

    if (fetchErr || !conv) throw new Error("Conversation not found");

    // 2. Upsert into conversation_reads when user_id is available
    if (user_id) {
      const { error } = await supabase.from("w_conversation_reads").upsert(
        {
          conversation_id: id,
          user_id: user_id,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      );

      if (error) throw error;
    }

    // Also clear unread badge + mark inbound messages as read (UI parity with WhatsApp-like behavior).
    await supabase
      .from("w_conversations")
      .update({ unread_count: 0 })
      .eq("id", id);

    await supabase
      .from("w_messages")
      .update({ status: "read" })
      .eq("conversation_id", id)
      .in("direction", ["inbound", "in"])
      .neq("status", "read");

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error marking read:", err);
    res.status(500).json({ error: err.message });
  }
});

// ====== WhatsApp Accounts & Meta API Connection ======

app.get(
  "/api/whatsapp/number-requests",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;

    try {
      if (!orgId)
        return res.status(400).json({ error: "No organization found" });

      const { data, error } = await supabase
        .from("whatsapp_number_requests")
        .select(
          "id, business_name, country, preferred_region, use_case, expected_monthly_messages, contact_name, contact_email, contact_phone, status, admin_notes, created_at, updated_at",
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      res.json({ requests: data || [] });
    } catch (err: any) {
      console.error("[whatsapp/number-requests] List error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to load number requests" });
    }
  },
);

app.post(
  "/api/whatsapp/number-requests",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    const userId = req.user?.id || null;

    try {
      if (!orgId)
        return res.status(400).json({ error: "No organization found" });

      const businessName = cleanText(req.body?.business_name, 160);
      const country = cleanText(req.body?.country || "India", 80);
      const preferredRegion = cleanNullableText(
        req.body?.preferred_region,
        120,
      );
      const useCase = cleanText(req.body?.use_case, 800);
      const contactName = cleanNullableText(req.body?.contact_name, 120);
      const contactEmail = cleanNullableText(req.body?.contact_email, 160);
      const contactPhone = cleanNullableText(req.body?.contact_phone, 40);
      const expectedMonthlyMessagesRaw = req.body?.expected_monthly_messages;
      const expectedMonthlyMessages =
        expectedMonthlyMessagesRaw === "" ||
        expectedMonthlyMessagesRaw === null ||
        expectedMonthlyMessagesRaw === undefined
          ? null
          : Number(expectedMonthlyMessagesRaw);

      const errors: string[] = [];
      if (!businessName) errors.push("Business name is required.");
      if (!country) errors.push("Country is required.");
      if (!useCase || useCase.length < 20)
        errors.push(
          "Use case must explain the business requirement in at least 20 characters.",
        );
      if (contactEmail && !isValidEmail(contactEmail))
        errors.push("Contact email is invalid.");
      if (
        expectedMonthlyMessages !== null &&
        (!Number.isInteger(expectedMonthlyMessages) ||
          expectedMonthlyMessages < 0)
      ) {
        errors.push(
          "Expected monthly messages must be a positive whole number.",
        );
      }
      if (!contactEmail && !contactPhone)
        errors.push("Provide at least one contact email or phone number.");

      if (errors.length)
        return res.status(400).json({ error: errors[0], errors });

      const { data, error } = await supabase
        .from("whatsapp_number_requests")
        .insert({
          organization_id: orgId,
          user_id: userId,
          business_name: businessName,
          country,
          preferred_region: preferredRegion,
          use_case: useCase,
          expected_monthly_messages: expectedMonthlyMessages,
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          status: "requested",
          metadata: {
            source: "self_serve_app",
            official_onboarding_model: "assisted_request",
          },
        })
        .select(
          "id, business_name, country, preferred_region, use_case, expected_monthly_messages, contact_name, contact_email, contact_phone, status, admin_notes, created_at, updated_at",
        )
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, request: data });
    } catch (err: any) {
      console.error("[whatsapp/number-requests] Create error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to submit number request" });
    }
  },
);

// Get list of connected accounts
app.get("/api/whatsapp/accounts", authMiddleware, async (req, res) => {
  const orgId = (req as any).organization_id;

  try {
    if (!orgId) throw new Error("No organization found");

    const { data, error } = await supabase
      .from("w_wa_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "disconnected")
      .order("created_at", { ascending: false });

    if (error) throw error;
    // Strip encrypted tokens from the API response for security
    const safeData = (data || []).map((acc: any) => toSafeWhatsappAccount(acc));
    res.json(safeData);
  } catch (err: any) {
    console.error("Error fetching accounts:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add/Update Meta API Account
app.post("/api/whatsapp/accounts/meta", authMiddleware, async (req, res) => {
  const { phone_number_id, waba_id, access_token, display_phone_number, name } =
    req.body;
  const orgId = (req as any).organization_id;

  if (!phone_number_id || !access_token) {
    return res
      .status(400)
      .json({ error: "phone_number_id and access_token are required" });
  }

  try {
    if (!orgId)
      throw new Error(
        "No organization found. Make sure your Supabase is configured correctly.",
      );

    // Validate the token against Meta before saving
    const verifyUrl = `https://graph.facebook.com/v21.0/${String(phone_number_id).trim()}?fields=id,display_phone_number,verified_name&access_token=${String(access_token).trim()}`;
    const verifyRes = await fetch(verifyUrl);
    const verifyData: any = await verifyRes.json();
    if (verifyData.error) {
      return res
        .status(400)
        .json({ error: `Meta API error: ${verifyData.error.message}` });
    }

    const tokenInspection = await inspectMetaTokenPermissions(
      String(access_token).trim(),
    );
    if (tokenInspection.checked && tokenInspection.missingScopes.length > 0) {
      return res.status(400).json({
        error: `This Meta token can access the phone number but cannot be used for sending. Missing permission(s): ${tokenInspection.missingScopes.join(", ")}. Generate a System User token with whatsapp_business_messaging and whatsapp_business_management.`,
      });
    }
    if (tokenInspection.error) {
      console.warn(
        "[whatsapp/accounts/meta] Could not inspect Meta token permissions:",
        tokenInspection.error,
      );
    }

    const resolvedDisplayPhone =
      verifyData.display_phone_number || display_phone_number || null;
    const resolvedName =
      verifyData.verified_name || name || "WhatsApp Business API";
    const normalizedPhoneNumberId = String(phone_number_id).trim();

    await enforceWhatsAppCloudNumberLimit(orgId, normalizedPhoneNumberId);

    // Upsert the account (token is AES-256 encrypted before storage)
    const { data, error } = await supabase
      .from("w_wa_accounts")
      .upsert(
        {
          organization_id: orgId,
          phone_number_id: normalizedPhoneNumberId,
          whatsapp_business_account_id: waba_id ? String(waba_id).trim() : null,
          access_token_encrypted: encryptToken(String(access_token).trim()),
          display_phone_number: resolvedDisplayPhone,
          name: resolvedName,
          status: "connected",
        },
        { onConflict: "phone_number_id" },
      )
      .select("*")
      .single();

    if (error) {
      console.error("Supabase upsert error:", error);
      throw new Error(error.message);
    }
    res.json({ success: true, account: toSafeWhatsappAccount(data) });
  } catch (err: any) {
    console.error("Error saving Meta account:", err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.message, limit: err.limit });
  }
});

// Delete account
app.delete("/api/whatsapp/accounts/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const orgId = (req as any).organization_id;
  try {
    const { error } = await supabase
      .from("w_wa_accounts")
      .update({ status: "disconnected", access_token_encrypted: null })
      .eq("id", id)
      .eq("organization_id", orgId); // Ensure user can only delete their own accounts

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(
  "/api/whatsapp/accounts/:id/diagnostics",
  authMiddleware,
  async (req: any, res) => {
    const { id } = req.params;
    const orgId = req.organization_id;

    try {
      const { data: account, error } = await supabase
        .from("w_wa_accounts")
        .select(
          "id, organization_id, phone_number_id, whatsapp_business_account_id, access_token_encrypted, display_phone_number, name, status",
        )
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (error) throw error;
      if (!account?.id)
        return res.status(404).json({ error: "WhatsApp account not found" });

      res.json(await getMetaAccountDiagnostics(account));
    } catch (err: any) {
      console.error("WhatsApp account diagnostics error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to inspect WhatsApp account" });
    }
  },
);

app.get(
  "/api/whatsapp/accounts/:id/business-profile",
  authMiddleware,
  async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
      const account = await getOrgWhatsappAccount(id, orgId);
      if (!account?.id)
        return res.status(404).json({ error: "WhatsApp account not found" });

      const { access_token_encrypted, ...safeAccount } = account;
      let profile: any = {};
      let profileError: string | null = null;

      try {
        profile = await fetchMetaBusinessProfile(account);
      } catch (err: any) {
        profileError = err.message || "Failed to fetch profile from Meta";
      }

      res.json({
        account: safeAccount,
        profile,
        profile_error: profileError,
      });
    } catch (err: any) {
      console.error("Business profile fetch error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to fetch business profile" });
    }
  },
);

app.patch(
  "/api/whatsapp/accounts/:id/business-profile",
  authMiddleware,
  upload.single("profile_picture"),
  async (req: any, res) => {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
      const account = await getOrgWhatsappAccount(id, orgId);
      if (!account?.id)
        return res.status(404).json({ error: "WhatsApp account not found" });

      const token = account.access_token_encrypted
        ? decryptToken(account.access_token_encrypted)
        : "";
      if (!token)
        return res
          .status(400)
          .json({ error: "Selected account is missing a Meta access token" });

      const localName = String(req.body.local_name || "").trim();
      if (localName && localName !== account.name) {
        const { error: nameErr } = await supabase
          .from("w_wa_accounts")
          .update({ name: localName })
          .eq("id", id)
          .eq("organization_id", orgId);
        if (nameErr) throw nameErr;
      }

      let profilePictureHandle: string | null = null;
      if (req.file) {
        if (
          !["image/jpeg", "image/png"].includes(String(req.file.mimetype || ""))
        ) {
          return res
            .status(400)
            .json({
              error:
                "Profile picture must be a JPG or PNG image. WEBP is not accepted by Meta for WhatsApp profile pictures.",
            });
        }
        profilePictureHandle = await uploadMetaProfilePicture(req.file, token);
      }

      await updateMetaBusinessProfile(account, req.body, profilePictureHandle);

      const refreshedAccount = await getOrgWhatsappAccount(id, orgId);
      const profile = await fetchMetaBusinessProfile(refreshedAccount);
      const { access_token_encrypted, ...safeAccount } = refreshedAccount;

      res.json({
        success: true,
        account: safeAccount,
        profile,
      });
    } catch (err: any) {
      console.error("Business profile update error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to update business profile" });
    }
  },
);

// ====== Templates API Connection ======

function normalizeMetaTemplateStatus(status: any) {
  const value = String(status || "PENDING").toUpperCase();
  if (
    value.includes("APPROVED") ||
    value === "ACTIVE" ||
    value === "ACTIVE - QUALITY PENDING"
  )
    return "APPROVED";
  if (value.includes("REJECT")) return "REJECTED";
  if (value.includes("PAUSE")) return "PAUSED";
  if (value.includes("DISABLE")) return "DISABLED";
  if (value.includes("PENDING") || value.includes("IN_APPEAL"))
    return "PENDING";
  return value;
}

function mergeTemplateRows(metaRows: any[], localRows: any[]) {
  const byKey = new Map<string, any>();
  for (const row of localRows || []) {
    const key = `${String(row.name || "").toLowerCase()}::${String(row.language || "en_US")}`;
    byKey.set(key, {
      id: row.template_id || row.id,
      local_id: row.id,
      name: row.name,
      language: row.language,
      category: row.category,
      status: normalizeMetaTemplateStatus(row.status),
      quality_score: row.quality_score,
      rejected_reason: row.rejection_reason,
      components: row.components || row.normalized_payload?.components || [],
      validation_issues: row.validation_issues || [],
      risk_score: row.risk_score || 0,
      submitted_at: row.submitted_at,
      last_updated: row.updated_at,
      source: "local",
    });
  }
  for (const row of metaRows || []) {
    const key = `${String(row.name || "").toLowerCase()}::${String(row.language || "en_US")}`;
    const local = byKey.get(key) || {};
    byKey.set(key, {
      ...local,
      ...row,
      id: row.id || local.id,
      status: normalizeMetaTemplateStatus(row.status),
      quality_score: row.quality_score || row.quality || local.quality_score,
      rejected_reason:
        row.rejected_reason || row.reason || local.rejected_reason,
      source: local.local_id ? "meta+local" : "meta",
    });
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
}

async function upsertLocalTemplateSubmission(params: {
  organization_id: string;
  wa_account_id?: string | null;
  waba_id?: string | null;
  template_id?: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  quality_score?: string | null;
  rejection_reason?: string | null;
  components?: any[];
  normalized_payload?: any;
  validation_issues?: TemplateValidationIssue[];
  risk_score?: number;
  meta_response?: any;
  submitted_by?: string | null;
  submitted_at?: string | null;
}) {
  const status = normalizeMetaTemplateStatus(params.status);
  const now = new Date().toISOString();
  const payload: any = {
    organization_id: params.organization_id,
    wa_account_id: params.wa_account_id || null,
    waba_id: params.waba_id || null,
    template_id: params.template_id || null,
    name: params.name,
    language: params.language || "en_US",
    category: String(params.category || "MARKETING").toUpperCase(),
    status,
    quality_score: params.quality_score || null,
    rejection_reason: params.rejection_reason || null,
    components:
      params.components || params.normalized_payload?.components || [],
    normalized_payload: params.normalized_payload || {},
    validation_issues: params.validation_issues || [],
    risk_score: Number(params.risk_score || 0),
    meta_response: params.meta_response || {},
    submitted_by: params.submitted_by || null,
    submitted_at: params.submitted_at || (status === "PENDING" ? now : null),
    approved_at: status === "APPROVED" ? now : null,
    rejected_at: status === "REJECTED" ? now : null,
    last_synced_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("w_template_submissions")
    .upsert(payload, {
      onConflict: "organization_id,wa_account_id,name,language",
    });
  if (error)
    console.warn("[Templates] Local cache upsert failed:", error.message);
}

// Get list of templates
app.get("/api/whatsapp/templates", authMiddleware, async (req, res) => {
  const orgId = (req as any).organization_id;

  try {
    if (!orgId) throw new Error("No organization found");

    const { data: accounts } = await supabase
      .from("w_wa_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .not("whatsapp_business_account_id", "is", null);

    if (!accounts || accounts.length === 0) {
      return res.json([]);
    }

    const account = accounts[0];
    const token = decryptToken(account.access_token_encrypted);
    const waba_id = account.whatsapp_business_account_id;

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/message_templates?fields=id,name,language,status,category,components,quality_score,rejected_reason&limit=250`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const json = await response.json();

    if (!response.ok) {
      console.error("Meta API Error:", json);
      return res
        .status(response.status)
        .json({
          error: json.error?.message || "Failed to fetch templates from Meta",
        });
    }
    const metaTemplates = json.data || [];
    await Promise.all(
      metaTemplates.map((template: any) =>
        upsertLocalTemplateSubmission({
          organization_id: orgId,
          wa_account_id: account.id,
          waba_id,
          template_id: template.id || null,
          name: template.name,
          language: template.language || "en_US",
          category: template.category || "MARKETING",
          status: template.status || "PENDING",
          quality_score: template.quality_score || null,
          rejection_reason: template.rejected_reason || template.reason || null,
          components: template.components || [],
          normalized_payload: template,
          meta_response: template,
        }),
      ),
    );

    const { data: localRows, error: localErr } = await supabase
      .from("w_template_submissions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("wa_account_id", account.id);
    if (localErr)
      console.warn("[Templates] Local cache read failed:", localErr.message);

    res.json(mergeTemplateRows(metaTemplates, localRows || []));
  } catch (err: any) {
    console.error("Error fetching templates:", err);
    res.status(500).json({ error: err.message });
  }
});

// Validate Template
app.post(
  "/api/whatsapp/templates/validate",
  authMiddleware,
  async (req, res) => {
    try {
      const result = validateWhatsappTemplatePayload(req.body || {});
      res.json(result);
    } catch (err: any) {
      console.error("Validate Template Error:", err);
      res
        .status(500)
        .json({ error: err.message || "Template validation failed" });
    }
  },
);

// Create Template
app.post(
  "/api/whatsapp/templates",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    const orgId = (req as any).organization_id;
    const { name, category, language, components } = req.body;
    const file = req.file;

    try {
      if (!orgId) throw new Error("No organization found");

      const { data: accounts } = await supabase
        .from("w_wa_accounts")
        .select("*")
        .eq("organization_id", orgId)
        .not("whatsapp_business_account_id", "is", null);

      if (!accounts || accounts.length === 0) {
        return res
          .status(400)
          .json({ error: "No connected Meta account found" });
      }

      const account = accounts[0];
      const token = decryptToken(account.access_token_encrypted);
      const waba_id = account.whatsapp_business_account_id;
      const phone_id = account.phone_number_id;

      let parsedComponents = [];
      try {
        parsedComponents = JSON.parse(components || "[]");
      } catch (e) {
        return res.status(400).json({ error: "Invalid components format" });
      }

      if (file) {
        // Meta Resumable Upload API — must use App ID (not phone_id) to create upload sessions
        const appId = process.env.META_APP_ID;
        if (!appId)
          throw new Error(
            "META_APP_ID is not configured. Cannot upload media for templates.",
          );

        const initUrl = new URL(
          `https://graph.facebook.com/v20.0/${appId}/uploads`,
        );
        initUrl.searchParams.set("file_length", String(file.size));
        initUrl.searchParams.set("file_type", file.mimetype);
        initUrl.searchParams.set("access_token", token);

        const initRes = await fetch(initUrl, { method: "POST" });
        const initJson = await initRes.json();
        if (!initRes.ok)
          throw new Error(
            initJson.error?.message || "Upload initialization failed",
          );

        const uploadSessionId = initJson.id;

        const uploadRes = await fetch(
          `https://graph.facebook.com/v20.0/${uploadSessionId}`,
          {
            method: "POST",
            headers: {
              Authorization: `OAuth ${token}`,
              file_offset: "0",
              "Content-Type": file.mimetype || "application/octet-stream",
            },
            body: file.buffer as any,
          },
        );
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok)
          throw new Error(uploadJson.error?.message || "File upload failed");

        const handle = uploadJson.h;

        // Inject the handle into the HEADER component
        const headerObj = parsedComponents.find(
          (c: any) => c.type === "HEADER",
        );
        if (
          headerObj &&
          ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerObj.format)
        ) {
          headerObj.example = { header_handle: [handle] };
        }
      }

      const payload = {
        name,
        category,
        language,
        components: parsedComponents,
      };
      const validation = validateWhatsappTemplatePayload(payload);
      if (!validation.canSubmit) {
        return res.status(400).json({
          error:
            "Template has approval-risk issues. Fix the highlighted fields before submitting to Meta.",
          validation,
        });
      }

      const existingRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${waba_id}/message_templates?name=${encodeURIComponent(validation.normalized.name)}&fields=id,name,language,status&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const existingJson = await existingRes.json().catch(() => ({}));
      if (
        existingRes.ok &&
        Array.isArray(existingJson.data) &&
        existingJson.data.some(
          (tpl: any) =>
            tpl.name === validation.normalized.name &&
            tpl.language === validation.normalized.language,
        )
      ) {
        return res.status(409).json({
          error: `Template "${validation.normalized.name}" already exists for ${validation.normalized.language}. Use a new template name before submitting.`,
          code: "DUPLICATE_TEMPLATE_NAME",
          suggested_name: `${validation.normalized.name}_${Date.now().toString().slice(-6)}`,
        });
      }
      console.log(
        "[Template] Submitting to Meta:",
        JSON.stringify(payload, null, 2),
      );

      const response = await fetch(
        `https://graph.facebook.com/v20.0/${waba_id}/message_templates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const json = await response.json();

      if (!response.ok) {
        console.error(
          "[Template] Meta API Error (full):",
          JSON.stringify(json, null, 2),
        );
        const errMsg =
          json.error?.error_user_msg ||
          json.error?.message ||
          "Template creation failed";
        const errSubcode =
          json.error?.error_subcode || json.error?.code || null;
        const errData = json.error?.error_data || null;
        await upsertLocalTemplateSubmission({
          organization_id: orgId,
          wa_account_id: account.id,
          waba_id,
          name: validation.normalized.name,
          language: validation.normalized.language,
          category: validation.normalized.category,
          status: "REJECTED",
          rejection_reason: errMsg,
          components: validation.normalized.components,
          normalized_payload: validation.normalized,
          validation_issues: validation.issues,
          risk_score: validation.riskScore,
          meta_response: json,
          submitted_by: (req as any).user?.id || null,
        });
        return res.status(response.status).json({
          error: errMsg,
          code: /already exists|duplicate/i.test(errMsg)
            ? "DUPLICATE_TEMPLATE_NAME"
            : "META_TEMPLATE_CREATE_FAILED",
          suggested_name: /already exists|duplicate/i.test(errMsg)
            ? `${validation.normalized.name}_${Date.now().toString().slice(-6)}`
            : undefined,
          error_subcode: errSubcode,
          error_data: errData,
          validation,
          meta_error: json.error,
        });
      }
      await upsertLocalTemplateSubmission({
        organization_id: orgId,
        wa_account_id: account.id,
        waba_id,
        template_id: json.id || json.data?.id || null,
        name: validation.normalized.name,
        language: validation.normalized.language,
        category: validation.normalized.category,
        status: json.status || "PENDING",
        components: validation.normalized.components,
        normalized_payload: validation.normalized,
        validation_issues: validation.issues,
        risk_score: validation.riskScore,
        meta_response: json,
        submitted_by: (req as any).user?.id || null,
        submitted_at: new Date().toISOString(),
      });
      res.json({ success: true, data: json });
    } catch (err: any) {
      console.error("Create Template Error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// Delete Template
app.delete(
  "/api/whatsapp/templates/:name",
  authMiddleware,
  async (req, res) => {
    const orgId = (req as any).organization_id;
    const { name } = req.params;

    try {
      if (!orgId) throw new Error("No organization found");

      const { data: accounts } = await supabase
        .from("w_wa_accounts")
        .select("*")
        .eq("organization_id", orgId)
        .not("whatsapp_business_account_id", "is", null);

      if (!accounts || accounts.length === 0) {
        return res
          .status(400)
          .json({ error: "No connected Meta account found" });
      }

      const account = accounts[0];
      const token = decryptToken(account.access_token_encrypted);
      const waba_id = account.whatsapp_business_account_id;

      // Step 1: Fetch the template to get its numeric ID (hsm_id)
      // Meta recommends using both name + hsm_id for precise deletion
      let deleteUrl = `https://graph.facebook.com/v20.0/${waba_id}/message_templates?name=${encodeURIComponent(name)}`;
      try {
        const listRes = await fetch(
          `https://graph.facebook.com/v20.0/${waba_id}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const listJson = await listRes.json();
        if (listRes.ok && listJson.data?.length > 0) {
          const hsmId = listJson.data[0].id;
          // Use hsm_id for precise deletion of this specific variant
          deleteUrl = `https://graph.facebook.com/v20.0/${waba_id}/message_templates?name=${encodeURIComponent(name)}&hsm_id=${hsmId}`;
        }
      } catch (lookupErr) {
        // If lookup fails, proceed with name-only deletion
        console.warn(
          "[Template Delete] Could not fetch hsm_id, using name-only delete:",
          lookupErr,
        );
      }

      // Step 2: Delete the template
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();

      if (!response.ok) {
        console.error(
          "[Template Delete] Meta API Error:",
          JSON.stringify(json, null, 2),
        );
        // Provide a user-friendly message for permission errors
        let errMsg = json.error?.message || "Template deletion failed";
        if (json.error?.code === 100 || errMsg.includes("permission")) {
          errMsg =
            "Permission denied by Meta. Your connected account needs WhatsApp Business Management admin access to delete templates. You can delete it directly from Meta Business Manager.";
        }
        return res.status(response.status).json({ error: errMsg });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete Template Error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// Dev utility: simulate a message without WhatsApp connectivity.
// Stores in DB and emits the same socket payload the UI consumes.
app.post("/api/dev/simulate-message", async (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(404).end();

  const { conversation_id, text, sender } = req.body as {
    conversation_id?: string;
    text?: string;
    sender?: "user" | "agent";
  };

  if (!conversation_id)
    return res.status(400).json({ error: "conversation_id required" });
  if (!text || !String(text).trim())
    return res.status(400).json({ error: "text required" });

  try {
    const { data: conv, error: convErr } = await supabase
      .from("w_conversations")
      .select(
        `
                id,
                organization_id,
                wa_account_id,
                contact_id,
                contact:contacts(wa_id)
            `,
      )
      .eq("id", conversation_id)
      .single();

    if (convErr) throw convErr;
    if (!conv) throw new Error("Conversation not found");

    const orgId = conv.organization_id || (await ensureDefaultOrganizationId());
    if (!orgId) throw new Error("Organization not configured");

    const resolvedSender =
      sender === "agent" || sender === "user" ? sender : "user";
    const direction: "inbound" | "outbound" =
      resolvedSender === "agent" ? "outbound" : "inbound";
    const status: "sent" | "delivered" =
      direction === "outbound" ? "sent" : "delivered";

    const stored = await storeMessage({
      organization_id: orgId,
      contact_id: conv.contact_id,
      conversation_id: conv.id,
      wa_message_id: null,
      direction,
      type: "text",
      content: { text: String(text) },
      status,
      sender_type: direction === "outbound" ? "human_agent" : "customer",
      sender_user_id:
        direction === "outbound" ? (req as any).user?.id || null : null,
      automation_source: direction === "outbound" ? "manual" : "webhook",
    });

    await upsertConversation(orgId, conv.wa_account_id, conv.contact_id, {
      direction,
      preview: String(text),
    });

    io.emit("new_message", {
      from: conv.contact?.wa_id || null,
      text: String(text),
      sender: resolvedSender,
      conversation_id: conv.id,
      contact_id: conv.contact_id,
      message_id: stored?.id || null,
      wa_message_id: stored?.wa_message_id || null,
      created_at: stored?.created_at || new Date().toISOString(),
      status,
    });

    res.json({ success: true, message_id: stored?.id || null });
  } catch (err: any) {
    console.error("Simulate message error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to simulate message" });
  }
});

// ====== Webhook Receiver (POST) ======
app.post("/webhook", async (req, res) => {
  // Signature verify (recommended)
  if (APP_SECRET) {
    const ok = verifyMetaSignature(req);
    if (!ok) {
      console.log("❌ Webhook Signature Verification Failed!");
      return res.sendStatus(403);
    }
  }
  res.sendStatus(200); // Ack immediately

  console.log("==========================================");
  console.log("📥 WEBHOOK EVENT RECEIVED!");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("==========================================");

  try {
    const body = req.body;
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const metadata = value?.metadata; // has phone_number_id

    if (!value) return;

    if (
      change?.field === "message_template_status_update" ||
      value?.event === "message_template_status_update" ||
      value?.message_template_name
    ) {
      const wabaId = String(
        entry?.id ||
          value?.waba_id ||
          value?.whatsapp_business_account_id ||
          "",
      );
      const templateId =
        value?.message_template_id || value?.template_id || value?.id || null;
      const templateName =
        value?.message_template_name ||
        value?.name ||
        value?.template_name ||
        null;
      const templateLanguage =
        value?.message_template_language || value?.language || "en_US";
      const templateStatus = normalizeMetaTemplateStatus(
        value?.event ||
          value?.status ||
          value?.message_template_status ||
          "PENDING",
      );
      const rejectionReason =
        value?.reason ||
        value?.rejected_reason ||
        value?.disable_info?.reason ||
        value?.message_template_rejected_reason ||
        null;

      if (!templateName && !templateId) return;

      let query = supabase
        .from("w_template_submissions")
        .select(
          "id, organization_id, wa_account_id, name, language, category, components, normalized_payload",
        );
      if (templateId) query = query.eq("template_id", templateId);
      else
        query = query.eq("name", templateName).eq("language", templateLanguage);
      if (wabaId) query = query.eq("waba_id", wabaId);
      const { data: existing } = await query.maybeSingle();

      if (existing) {
        await upsertLocalTemplateSubmission({
          organization_id: existing.organization_id,
          wa_account_id: existing.wa_account_id,
          waba_id: wabaId || existing.normalized_payload?.waba_id || null,
          template_id: templateId,
          name: existing.name,
          language: existing.language,
          category: value?.category || existing.category,
          status: templateStatus,
          quality_score: value?.quality_score || value?.quality || null,
          rejection_reason: rejectionReason,
          components: existing.components || [],
          normalized_payload: existing.normalized_payload || {},
          meta_response: value,
        });
        io.to(`org:${existing.organization_id}`).emit(
          "template_status_updated",
          {
            name: existing.name,
            language: existing.language,
            status: templateStatus,
            rejected_reason: rejectionReason,
          },
        );
      } else {
        console.warn(
          "[Templates] Status webhook received for unknown template:",
          value,
        );
      }
      return;
    }

    // 1. Identify Organization & Account
    const phone_number_id = metadata?.phone_number_id;
    let organization_id = null;
    let wa_account_id = null;

    if (phone_number_id && supabase) {
      const { data: acc } = await supabase
        .from("w_wa_accounts")
        .select("id, organization_id")
        .eq("phone_number_id", phone_number_id)
        .maybeSingle();

      if (acc) {
        organization_id = acc.organization_id;
        wa_account_id = acc.id;
      }
    }

    if (!organization_id) {
      console.error(
        `❌ Webhook Error: Phone ID ${phone_number_id} not mapped to any organization.`,
      );
      return;
    }

    // 2. Handle Messages (Inbound)
    if (value.messages?.length) {
      const msg = value.messages[0];
      const contacts = value.contacts || [];

      const from = msg.from; // wa_id
      const profileName = contacts[0]?.profile?.name || null;
      const wa_message_id = msg.id;

      let type = msg.type;
      let text = "";
      let interactivePayload: any = null; // button/list reply ka raw data

      if (type === "reaction") {
        const targetWaId = msg.reaction?.message_id || null;
        const emoji =
          typeof msg.reaction?.emoji === "string"
            ? msg.reaction.emoji.trim()
            : "";

        if (targetWaId) {
          const { data: target, error: targetErr } = await supabase
            .from("w_messages")
            .select("id, conversation_id, reactions")
            .eq("organization_id", organization_id)
            .eq("wa_message_id", targetWaId)
            .maybeSingle();

          if (!targetErr && target) {
            const nextReactions = applyReactionUpdate(
              target.reactions,
              emoji || null,
              from,
            );
            const { error: updErr } = await supabase
              .from("w_messages")
              .update({ reactions: nextReactions })
              .eq("id", target.id)
              .eq("organization_id", organization_id);

            if (updErr) {
              console.error("Failed to update Cloud reaction", updErr);
            } else {
              io.to(`org:${organization_id}`).emit("message_updated", {
                conversation_id: target.conversation_id,
                message_id: target.id,
                wa_message_id: targetWaId,
                reactions: nextReactions,
              });
            }
          }
        }
        return;
      }

      // REPLACED: Updated type extraction logic for interactive/buttons
      if (type === "text") {
        text = msg.text?.body || "";
      } else if (type === "interactive") {
        interactivePayload = msg.interactive;
        text =
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          msg.interactive?.button_reply?.id ||
          msg.interactive?.list_reply?.id ||
          `[interactive:${msg.interactive.type}]`;
      } else if (type === "button") {
        text = msg.button?.text || "";
      } else if (type === "image") {
        text = msg.image?.caption || "[Image]";
      } else if (type === "video") {
        text = msg.video?.caption || "[Video]";
      } else if (type === "audio") {
        text = "[Audio]";
      } else if (type === "document") {
        text = msg.document?.filename || "[Document]";
      } else {
        text = `[${type}]`;
      }

      // Ensure wa_account exists so conversations FK/unique constraints work
      if (!wa_account_id && phone_number_id && supabase) {
        const { data: newAcc } = await supabase
          .from("w_wa_accounts")
          .upsert(
            {
              organization_id,
              phone_number_id,
              display_phone_number:
                metadata?.display_phone_number || phone_number_id,
              access_token_encrypted: ACCESS_TOKEN
                ? encryptToken(ACCESS_TOKEN)
                : "",
              status: "connected",
            },
            { onConflict: "phone_number_id" },
          )
          .select("id")
          .single();
        wa_account_id = newAcc?.id || null;
      }

      // A. Upsert Contact
      const contact = await upsertContact(
        organization_id,
        wa_account_id,
        from,
        profileName,
      );

      // B. Upsert Conversation
      const conv = await upsertConversation(
        organization_id,
        wa_account_id,
        contact.id,
        {
          direction: "inbound",
          preview: text,
        },
      );

      // Quoted/Reply context extract karo
      let quotedMessage: any = null;
      const isForwarded = !!(
        msg.context?.forwarded || msg.context?.frequently_forwarded
      );
      if (msg.context?.id) {
        // DB mein quoted message dhundo
        const { data: quotedMsg } = await supabase
          .from("w_messages")
          .select("id, text_body, type, content, wa_message_id, direction")
          .eq("wa_message_id", msg.context.id)
          .maybeSingle();

        quotedMessage = {
          wa_message_id: msg.context.id,
          from: msg.context.from || null,
          // Agar DB mein mila toh uska text use karo
          text: quotedMsg?.text_body || quotedMsg?.content?.text || null,
          type: quotedMsg?.type || "text",
          direction: quotedMsg?.direction || null,
          found: !!quotedMsg,
        };
      }

      // PRE-DEFINE CONTENT (Media will update this row later)
      const enrichedContent: any = {
        text,
        raw: msg,
        quoted: quotedMessage,
        forwarded: isForwarded,
        frequently_forwarded: !!msg.context?.frequently_forwarded,
      };

      // C. Insert Message
      const storedInbound = await storeMessage({
        organization_id,
        contact_id: contact.id,
        conversation_id: conv.id, // TS fix needed? Cast in storeMessage helper
        wa_message_id,
        direction: "inbound",
        type,
        content: enrichedContent,
        status: "delivered",
        sender_type: "customer",
        automation_source: "webhook",
      } as any);

      // D. Emit Realtime
      // Emit to org room
      io.to(`org:${organization_id}`).emit("new_message", {
        from,
        phone: from,
        text,
        quoted: quotedMessage || null,
        forwarded: isForwarded,
        sender: "user",
        conversation_id: conv.id,
        contact_id: contact.id,
        message_id: storedInbound?.id || null,
        wa_message_id,
        created_at: storedInbound?.created_at || new Date().toISOString(),
        status: "delivered",
        name: profileName,
        connectedAccount: metadata?.display_phone_number,
        type,
        ...(enrichedContent?.media_url
          ? { media_url: enrichedContent.media_url }
          : {}),
        ...(enrichedContent?.mime_type
          ? { mime_type: enrichedContent.mime_type }
          : {}),
        ...(enrichedContent?.file_name
          ? { file_name: enrichedContent.file_name }
          : {}),
      });

      // If media, download from Meta and store in Supabase Storage
      if (["image", "video", "audio", "document"].includes(type)) {
        // RUN THIS ASYNC TO NOT BLOCK THE THREAD
        (async () => {
          const mediaId =
            type === "image"
              ? msg.image?.id
              : type === "video"
                ? msg.video?.id
                : type === "audio"
                  ? msg.audio?.id
                  : type === "document"
                    ? msg.document?.id
                    : null;

          if (mediaId && phone_number_id) {
            const downloaded = await downloadMetaMedia({
              phone_number_id,
              mediaId,
            });
            if (downloaded) {
              const uploaded = await uploadMediaToStorage({
                organization_id,
                conversation_id: conv.id,
                fileName: downloaded.fileName,
                mimeType: downloaded.mimeType,
                buffer: downloaded.buffer,
              });

              const caption =
                type === "image"
                  ? msg.image?.caption || null
                  : type === "video"
                    ? msg.video?.caption || null
                    : type === "document"
                      ? msg.document?.caption || null
                      : null;

              const finalMediaContent = {
                text: caption,
                media_url: uploaded.publicUrl,
                mime_type: downloaded.mimeType,
                file_name: downloaded.fileName,
                quoted: quotedMessage,
                forwarded: isForwarded,
                frequently_forwarded: !!msg.context?.frequently_forwarded,
                raw: msg,
              };

              // UPDATE THE MESSAGE CONTENT IN DB AFTER UPLOAD
              if (storedInbound?.id) {
                await supabase
                  .from("w_messages")
                  .update({ content: finalMediaContent })
                  .eq("id", storedInbound.id);
                // EMIT UPDATE TO FRONTEND
                io.emit("message_updated", {
                  message_id: storedInbound.id,
                  content: finalMediaContent,
                });
              }
            }
          }
        })();
      }

      // E. Bot Auto-Reply
      try {
        let flowConsumedMessage = false;

        // Flow engine: text + button replies + interactive replies sab process karo
        const isFlowEligible =
          (type === "text" || type === "interactive" || type === "button") &&
          text;

        if (isFlowEligible) {
          const flowResult = await processFlowEngine(
            organization_id,
            contact.id,
            conv.id,
            text,
            storedInbound?.id || null,
            conv.wa_account_id || null,
          );
          if (flowResult?.consumed) {
            flowConsumedMessage = true;

            // 1. Send preceding text output if present
            if (flowResult.output) {
              console.log(
                `🌊 Flow Engine replied with text to: "${text.substring(0, 50)}"`,
              );
              const sendResult = await sendTextMessage(
                from,
                flowResult.output,
                phone_number_id,
              );
              const botWaMessageId = sendResult?.messages?.[0]?.id || null;

              const storedBotReply = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id,
                wa_message_id: botWaMessageId,
                direction: "outbound",
                type: "text",
                content: { text: flowResult.output, is_flow: true },
                status: "sent",
                is_bot_reply: true,
                sender_type: "ai_agent",
                automation_source: "flow",
                metadata: {
                  flow_id: flowResult.flow_id,
                  flow_version_id: flowResult.flow_version_id,
                  flow_session_id: flowResult.flow_session_id,
                  flow_run_id: flowResult.flow_run_id,
                  flow_node_id: flowResult.flow_node_id,
                  handoff: flowResult.handoff === true,
                },
              } as any);

              io.emit("new_message", {
                from: metadata?.display_phone_number || phone_number_id,
                phone: from,
                text: flowResult.output,
                sender: "agent",
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedBotReply?.id || null,
                wa_message_id: botWaMessageId,
                created_at:
                  storedBotReply?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number,
                type: "text",
                is_bot_reply: true,
              });
            }

            // 2. Send interactive buttons if present
            if (flowResult.interactive?.type === "button") {
              console.log(`🔘 Flow Engine sending real buttons`);
              const { body, buttons, footer } = flowResult.interactive;
              const sendResult = await sendInteractiveButtons(
                from,
                body,
                buttons,
                footer,
                phone_number_id,
              );
              const botWaMessageId = sendResult?.messages?.[0]?.id || null;

              const storedBotReply = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id,
                wa_message_id: botWaMessageId,
                direction: "outbound",
                type: "interactive",
                content: {
                  text: body,
                  interactive: flowResult.interactive,
                  is_flow: true,
                },
                status: "sent",
                is_bot_reply: true,
                sender_type: "ai_agent",
                automation_source: "flow",
                metadata: {
                  flow_id: flowResult.flow_id,
                  flow_version_id: flowResult.flow_version_id,
                  flow_session_id: flowResult.flow_session_id,
                  flow_run_id: flowResult.flow_run_id,
                  flow_node_id: flowResult.flow_node_id,
                  handoff: flowResult.handoff === true,
                },
              } as any);

              io.emit("new_message", {
                from: metadata?.display_phone_number || phone_number_id,
                phone: from,
                text: body,
                sender: "agent",
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedBotReply?.id || null,
                wa_message_id: botWaMessageId,
                created_at:
                  storedBotReply?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number,
                type: "interactive",
                is_bot_reply: true,
              });
            }

            // 3. Send media nodes as real WhatsApp attachments.
            if (
              Array.isArray(flowResult.media) &&
              flowResult.media.length > 0
            ) {
              for (const media of flowResult.media) {
                try {
                  const sentMedia = await sendFlowMediaMessageMeta({
                    phone_number_id,
                    to: from,
                    media,
                  });
                  const preview =
                    media.caption ||
                    (media.type === "image"
                      ? "[Image]"
                      : media.type === "video"
                        ? "[Video]"
                        : media.type === "audio"
                          ? "[Audio]"
                          : "[Document]");

                  const storedBotMedia = await storeMessage({
                    organization_id,
                    contact_id: contact.id,
                    conversation_id: conv.id,
                    wa_message_id: sentMedia.wa_message_id,
                    direction: "outbound",
                    type: media.type,
                    content: {
                      text: media.caption || null,
                      media_url: sentMedia.media_url,
                      mime_type: sentMedia.mime_type,
                      file_name: sentMedia.file_name,
                      size: sentMedia.size,
                      is_flow: true,
                      raw_send: sentMedia.raw,
                    },
                    status: "sent",
                    is_bot_reply: true,
                    sender_type: "ai_agent",
                    automation_source: "flow",
                    metadata: {
                      flow_id: flowResult.flow_id,
                      flow_version_id: flowResult.flow_version_id,
                      flow_session_id: flowResult.flow_session_id,
                      flow_run_id: flowResult.flow_run_id,
                      flow_node_id: flowResult.flow_node_id,
                      handoff: flowResult.handoff === true,
                    },
                  } as any);

                  io.emit("new_message", {
                    from: metadata?.display_phone_number || phone_number_id,
                    phone: from,
                    text: preview,
                    sender: "agent",
                    conversation_id: conv.id,
                    contact_id: contact.id,
                    message_id: storedBotMedia?.id || null,
                    wa_message_id: sentMedia.wa_message_id,
                    created_at:
                      storedBotMedia?.created_at || new Date().toISOString(),
                    connectedAccount: metadata?.display_phone_number,
                    type: media.type,
                    media_url: sentMedia.media_url,
                    mime_type: sentMedia.mime_type,
                    file_name: sentMedia.file_name,
                    is_bot_reply: true,
                  });
                } catch (mediaErr: any) {
                  console.error(
                    "[Flow] Failed to send media node:",
                    mediaErr?.message || mediaErr,
                  );
                }
              }
            }

            // Update conversation preview
            const lastMedia = Array.isArray(flowResult.media)
              ? flowResult.media[flowResult.media.length - 1]
              : null;
            const lastPreview = lastMedia
              ? lastMedia.caption ||
                (lastMedia.type === "document"
                  ? "[Document]"
                  : `[${lastMedia.type.charAt(0).toUpperCase()}${lastMedia.type.slice(1)}]`)
              : flowResult.interactive?.body || flowResult.output || "";
            await supabase
              .from("w_conversations")
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: lastPreview.substring(0, 100),
              })
              .eq("id", conv.id);
          }
        }

        // AI Agent fallback — sirf tab jab flow ne consume nahi kiya aur type text hai
        if (!flowConsumedMessage && type === "text" && text) {
          const botResult = await getBotAgentReply({
            organization_id,
            conversation_id: conv.id,
            text,
          });
          if (botResult?.reply) {
            console.log(`🤖 Bot "${botResult.agent?.name}" replying`);
            const sendResult = await sendTextMessage(
              from,
              botResult.reply,
              phone_number_id,
            );
            const botWaMessageId = sendResult?.messages?.[0]?.id || null;
            const storedBotReply = await storeMessage({
              organization_id,
              contact_id: contact.id,
              conversation_id: conv.id,
              wa_message_id: botWaMessageId,
              direction: "outbound",
              type: "text",
              content: {
                text: botResult.reply,
                bot_agent_id: botResult.agent?.id,
                bot_agent_name: botResult.agent?.name,
              },
              status: "sent",
              is_bot_reply: true,
              bot_agent_id: botResult.agent?.id || null,
              sender_type: "ai_agent",
              automation_source: "ai_agent",
            } as any);
            io.emit("new_message", {
              from: metadata?.display_phone_number || phone_number_id,
              phone: from,
              text: botResult.reply,
              sender: "agent",
              conversation_id: conv.id,
              contact_id: contact.id,
              message_id: storedBotReply?.id || null,
              wa_message_id: botWaMessageId,
              created_at:
                storedBotReply?.created_at || new Date().toISOString(),
              connectedAccount: metadata?.display_phone_number,
              type: "text",
              is_bot_reply: true,
              bot_agent_name: botResult.agent?.name,
            });

            // Update conversation preview
            await supabase
              .from("w_conversations")
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: botResult.reply.substring(0, 100),
              })
              .eq("id", conv.id);
          }
        }
      } catch (botErr: any) {
        console.error("Bot auto-reply error:", botErr.message || botErr);
      }
    }

    // 3. Handle Status Updates (Sent/Delivered/Read)
    if (value.statuses?.length) {
      const status = value.statuses[0];
      const wa_message_id = status.id;
      const newStatus = status.status; // sent, delivered, read

      // Update message status in DB
      await supabase
        .from("w_messages")
        .update({ status: newStatus })
        .eq("wa_message_id", wa_message_id);

      io.emit("message_status_update", { wa_message_id, status: newStatus });

      // If "read", maybe mark conversation as read?
      // Usually "read" status on a message doesn't mean *we* read it, it means *user* read our message.
      // So we don't reset unread_count here.

      // Log event (optional)
      // await supabase.from('w_message_events').insert(...)
    }
  } catch (e: any) {
    console.error("Webhook Error:", e.message);
  }
});

// ====== Baileys Implementation ======

async function upsertBaileysWaAccount(
  orgId: string | null | undefined,
  phone: string | null | undefined,
) {
  const cleanPhone = String(phone || "").replace(/\D+/g, "");
  if (!supabase || !orgId || !cleanPhone) return null;

  const { data, error } = await supabase
    .from("w_wa_accounts")
    .upsert(
      {
        organization_id: orgId,
        phone_number_id: cleanPhone,
        display_phone_number: cleanPhone,
        name: "WhatsApp Account",
        status: "connected",
      },
      { onConflict: "phone_number_id" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("Failed to upsert Baileys wa_account:", error);
    return null;
  }

  return data?.id || null;
}

async function setupBaileys(
  sessionId: string,
  socket: any,
  orgIdFromRequest: string | null = null,
) {
  // CRITICAL FIX: Check concurrency lock
  if (initializingSessions.has(sessionId)) {
    console.log(
      `â³ Session ${sessionId} is already initializing. Skipping duplicate request.`,
    );
    return;
  }

  // CRITICAL FIX: Check if session already exists to prevent multiple connections
  const existingSession = sessions.get(sessionId);
  if (existingSession) {
    console.log(
      `âš ï¸ Session ${sessionId} already active, reusing existing connection`,
    );
    // Only report connected if we actually have a logged-in user on this socket.
    if (existingSession?.user?.id) socket.emit("status", "connected");
    else socket.emit("status", "connecting");

    // Emit info if available
    const connectedJid = existingSession.user?.id || "";
    const connectedAccount = connectedJid ? connectedJid.split(":")[0] : null;
    if (connectedAccount) {
      let existingOrgId =
        orgIdFromRequest || socket?.data?.organization_id || null;
      const sessionOrgFile = `baileys_auth_info/${sessionId}/org_id.txt`;
      if (!existingOrgId && fs.existsSync(sessionOrgFile)) {
        existingOrgId = fs.readFileSync(sessionOrgFile, "utf8").trim();
      }
      await upsertBaileysWaAccount(existingOrgId, connectedAccount);
      socket.emit("connected_account", connectedAccount);
    }

    return existingSession;
  }

  initializingSessions.add(sessionId);

  try {
    const sessionDir = `baileys_auth_info/${sessionId}`;
    const orgFile = `${sessionDir}/org_id.txt`;

    // Create dir if needed
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Persist/Resolve Organization ID
    let organization_id = orgIdFromRequest;
    if (!organization_id && fs.existsSync(orgFile)) {
      organization_id = fs.readFileSync(orgFile, "utf8").trim();
    }

    if (organization_id) {
      fs.writeFileSync(orgFile, organization_id);
    } else {
      // Check if we can find it in socket data
      organization_id = socket?.data?.organization_id || null;
      if (organization_id) {
        fs.writeFileSync(orgFile, organization_id);
      }
    }

    if (!organization_id) {
      console.warn(
        `⚠️ Cannot initialize Baileys session ${sessionId} - No Organization ID provided or persisted.`,
      );
      initializingSessions.delete(sessionId);
      return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

    // Create a logger that's silent to avoid noise
    const logger = pino({ level: "silent" });

    // Store messages for retry mechanism (fixes "Waiting for this message" issue)
    const msgRetryCounterCache = new Map<string, number>();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        // Use cacheable signal key store for better encryption key management
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      // CRITICAL: Proper browser identification for multi-device
      browser: Browsers.ubuntu("Chrome"),
      // Enable history sync
      syncFullHistory: true,
      // Needed to receive events for messages sent by this logged-in account
      emitOwnEvents: true,
      // QR will be handled via socket.emit to frontend
      printQRInTerminal: false,
      // Prevent connection being marked as stale too quickly
      defaultQueryTimeoutMs: 60000,
      // Keep online to maintain encryption key sync
      markOnlineOnConnect: true,
      // Generate high-quality link preview
      generateHighQualityLinkPreview: true,
      // Retry message handling
      msgRetryCounterCache: msgRetryCounterCache as any,
      // CRITICAL: This callback is called when a message needs to be resent
      getMessage: async (key) => {
        // Try to get message from database if we stored it
        if (key.id) {
          try {
            const { data } = await supabase
              .from("w_messages")
              .select("content")
              .eq("wa_message_id", key.id)
              .maybeSingle();
            if (data?.content?.text) {
              return proto.Message.fromObject({
                conversation: data.content.text,
              });
            }
          } catch (e) {
            console.log("getMessage lookup failed:", e);
          }
        }
        // Return undefined to let Baileys handle it
        return undefined;
      },
      logger,
    });

    sock.ev.on("creds.update", saveCreds);

    // Keep a small cache for account id for this socket.
    let cachedWaAccountId: string | null = null;
    const resolveOrgAndAccount = async () => {
      if (cachedWaAccountId)
        return { orgId: organization_id!, waAccountId: cachedWaAccountId };

      const orgId = organization_id!;

      const myJid = sock.user?.id || "";
      const myPhone = myJid.split(":")[0];
      if (!myPhone) return { orgId, waAccountId: null as any };

      const { data: acc } = await supabase
        .from("w_wa_accounts")
        .select("id")
        .eq("organization_id", orgId)
        .eq("phone_number_id", myPhone)
        .maybeSingle();

      let waAccountId = acc?.id || null;
      if (!waAccountId) {
        waAccountId = await upsertBaileysWaAccount(orgId, myPhone);
      }

      cachedWaAccountId = waAccountId;
      return { orgId, waAccountId };
    };

    // Persist contact names when Baileys provides them (notify/name/verifiedName).
    // This is the only reliable way to show names in the UI for Baileys sessions.
    const upsertBaileysContacts = async (contacts: any[]) => {
      try {
        if (!Array.isArray(contacts) || contacts.length === 0) return;

        const { orgId, waAccountId } = await resolveOrgAndAccount();
        if (!orgId || !waAccountId) return;

        for (const c of contacts) {
          const jid = c?.id || c?.jid || c?.key || null;
          const waId = normalizeContactWaIdForStorage(jid);
          if (!waId) continue;

          const name = pickBestBaileysContactName(c, waId);
          if (!name) continue;

          await upsertContact(orgId, waAccountId, waId, name);
        }
      } catch (err: any) {
        console.warn("âš ï¸ contacts sync failed:", err?.message || err);
      }
    };

    sock.ev.on("contacts.upsert", async (contacts: any[]) => {
      // Runs on initial sync and when new contacts are discovered.
      upsertBaileysContacts(contacts);
    });

    sock.ev.on("contacts.update", async (updates: any[]) => {
      // Runs when notify/name changes.
      upsertBaileysContacts(updates);
    });

    // âœ… NEW: Listen for incoming w_messages (new + history)
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      // type can be "notify" (new) or "append" (history sync)
      if (type !== "notify" && type !== "append") return;
      const isHistorySync = type === "append";

      console.log(
        `ðŸ“© messages.upsert type=${type} count=${messages?.length || 0}`,
      );

      const orgId = organization_id || (await ensureDefaultOrganizationId());
      if (!orgId) return;

      const myJid = sock.user?.id || "";
      const myPhone = myJid.split(":")[0];

      // Resolve wa_account_id once per batch
      const { data: acc } = await supabase
        .from("w_wa_accounts")
        .select("id")
        .eq("organization_id", orgId)
        .eq("phone_number_id", myPhone)
        .maybeSingle();

      let waAccountId = acc?.id;
      if (!waAccountId) {
        waAccountId = await upsertBaileysWaAccount(orgId, myPhone);
      }
      if (!waAccountId) return;

      for (const msg of messages) {
        try {
          const isOutbound = msg.key.fromMe;
          const remoteJid = msg.key.remoteJid || "";
          if (!remoteJid) continue;

          if (!isHistorySync) {
            console.log(
              `   â†³ jid=${remoteJid} fromMe=${isOutbound} id=${msg.key.id || ""}`,
            );
          }

          // Ignore status broadcast; keep groups and newsletters.
          if (remoteJid === "status@broadcast") continue;

          const isGroup = remoteJid.endsWith("@g.us");
          const isNewsletter = remoteJid.endsWith("@newsletter");

          // For 1:1 store phone number only; for groups/newsletters store full JID.
          const contactWaId = remoteJid.endsWith("@s.whatsapp.net")
            ? remoteJid.split("@")[0]
            : remoteJid;

          const msgType = Object.keys(msg.message || {})[0] || "";
          if (!msgType) continue;

          let normalizedType:
            | "text"
            | "image"
            | "video"
            | "audio"
            | "document"
            | "sticker" = "text";
          let captionText = "";
          let previewText = "";

          // Reactions must patch the target message, not render as a new bubble.
          if (msgType === "reactionMessage") {
            const reaction = (msg.message as any)?.reactionMessage;
            const targetWaId = reaction?.key?.id || null;
            const emoji =
              typeof reaction?.text === "string" ? reaction.text.trim() : "";
            const from = String(
              (msg.key as any)?.participant ||
                (msg as any)?.participant ||
                contactWaId ||
                "unknown",
            );

            if (targetWaId) {
              const { data: target, error: targetErr } = await supabase
                .from("w_messages")
                .select("id, conversation_id, reactions")
                .eq("wa_message_id", targetWaId)
                .maybeSingle();

              if (!targetErr && target) {
                const nextReactions = applyReactionUpdate(
                  target.reactions,
                  emoji || null,
                  from,
                );
                const { error: updErr } = await supabase
                  .from("w_messages")
                  .update({ reactions: nextReactions })
                  .eq("id", target.id);

                if (updErr) {
                  console.error(
                    "Failed to update reactions (did you run the migration?)",
                    updErr,
                  );
                } else if (!isHistorySync) {
                  io.emit("message_updated", {
                    conversation_id: target.conversation_id,
                    message_id: target.id,
                    wa_message_id: targetWaId,
                    reactions: nextReactions,
                  });
                }
              }
            }
            continue;
          }

          // Protocol/system noise should never render as chat bubbles.
          if (msgType === "protocolMessage") {
            continue;
          }

          if (msgType === "conversation") {
            captionText = msg.message?.conversation || "";
            previewText = captionText;
          } else if (msgType === "extendedTextMessage") {
            captionText = msg.message?.extendedTextMessage?.text || "";
            previewText = captionText;
          } else if (msgType === "imageMessage") {
            normalizedType = "image";
            captionText = msg.message?.imageMessage?.caption || "";
            previewText = captionText || "[Image]";
          } else if (msgType === "videoMessage") {
            normalizedType = "video";
            captionText = msg.message?.videoMessage?.caption || "";
            previewText = captionText || "[Video]";
          } else if (msgType === "documentMessage") {
            normalizedType = "document";
            const fileName = msg.message?.documentMessage?.fileName || "";
            const docCaption =
              (msg.message as any)?.documentMessage?.caption || "";
            captionText = docCaption;
            previewText = docCaption || fileName || "[Document]";
          } else if (msgType === "audioMessage") {
            normalizedType = "audio";
            captionText = "";
            previewText = "[Audio]";
          } else if (msgType === "stickerMessage") {
            normalizedType = "sticker";
            captionText = "";
            previewText = "[Sticker]";
          } else {
            // Unknown/unsupported message types: ignore instead of persisting provider keys like [stickerMessage]
            continue;
          }

          const contextInfo =
            (msg.message as any)?.extendedTextMessage?.contextInfo ||
            (msg.message as any)?.imageMessage?.contextInfo ||
            (msg.message as any)?.videoMessage?.contextInfo ||
            (msg.message as any)?.documentMessage?.contextInfo ||
            (msg.message as any)?.audioMessage?.contextInfo ||
            (msg.message as any)?.stickerMessage?.contextInfo ||
            null;
          const isForwarded = !!(
            contextInfo?.isForwarded ||
            Number(contextInfo?.forwardingScore || 0) > 0
          );

          // Thread name (group/channel)
          let threadName: string | null = null;
          if (isGroup) {
            const cached = groupNameCache.get(remoteJid);
            const isFresh =
              cached && Date.now() - cached.fetchedAt < GROUP_NAME_TTL_MS;
            if (isFresh) {
              threadName = cached!.subject;
            } else {
              try {
                const meta = await sock.groupMetadata(remoteJid);
                if (meta?.subject) {
                  threadName = meta.subject;
                  groupNameCache.set(remoteJid, {
                    subject: meta.subject,
                    fetchedAt: Date.now(),
                  });
                }
              } catch {
                // ignore
              }
            }
            if (!threadName) threadName = `Group ${remoteJid.split("@")[0]}`;
          } else if (isNewsletter) {
            threadName = `Channel ${remoteJid.split("@")[0]}`;
          }

          const senderName = isOutbound
            ? "You"
            : sanitizeContactDisplayName(msg.pushName || null, contactWaId);

          // 1) Upsert Contact (this represents the thread for groups/newsletters too)
          const contact = await upsertContact(
            orgId,
            waAccountId,
            contactWaId,
            threadName || (isOutbound ? null : senderName),
          );

          // 2) Upsert Conversation
          const direction = isOutbound ? "outbound" : "inbound";
          const conv = await upsertConversation(
            orgId,
            waAccountId,
            contact.id,
            {
              direction,
              preview: previewText,
            },
          );

          // 3) Store Message (download media when possible)
          let enrichedContent: any = {
            text: captionText || null,
            rawType: msgType,
            forwarded: isForwarded,
            forwarding_score: Number(contextInfo?.forwardingScore || 0) || 0,
          };
          if (
            ["image", "video", "document", "audio", "sticker"].includes(
              normalizedType,
            ) &&
            msg.message
          ) {
            try {
              let inner: any = null;
              let streamType: any = null;
              let mimeType = "application/octet-stream";
              let fileName = `${normalizedType}-${msg.key.id || crypto.randomUUID()}`;

              if (msgType === "imageMessage") {
                inner = msg.message.imageMessage;
                streamType = "image";
                mimeType = inner?.mimetype || "image/jpeg";
                fileName = `image-${msg.key.id || crypto.randomUUID()}.jpg`;
              } else if (msgType === "videoMessage") {
                inner = msg.message.videoMessage;
                streamType = "video";
                mimeType = inner?.mimetype || "video/mp4";
                fileName = `video-${msg.key.id || crypto.randomUUID()}.mp4`;
              } else if (msgType === "audioMessage") {
                inner = msg.message.audioMessage;
                streamType = "audio";
                mimeType = inner?.mimetype || "audio/ogg";
                fileName = `audio-${msg.key.id || crypto.randomUUID()}.ogg`;
              } else if (msgType === "documentMessage") {
                inner = msg.message.documentMessage;
                streamType = "document";
                mimeType = inner?.mimetype || "application/octet-stream";
                fileName = inner?.fileName || fileName;
              } else if (msgType === "stickerMessage") {
                inner = (msg.message as any).stickerMessage;
                streamType = "sticker";
                mimeType = inner?.mimetype || "image/webp";
                fileName = `sticker-${msg.key.id || crypto.randomUUID()}.webp`;
              }

              if (inner && streamType) {
                const stream = await downloadContentFromMessage(
                  inner,
                  streamType,
                );
                const buffer = await streamToBuffer(stream);
                const uploaded = await uploadMediaToStorage({
                  organization_id: orgId,
                  conversation_id: conv.id,
                  fileName,
                  mimeType,
                  buffer,
                });

                enrichedContent = {
                  text: captionText || null,
                  media_url: uploaded.publicUrl,
                  mime_type: mimeType,
                  file_name: fileName,
                  duration_seconds:
                    msgType === "audioMessage" &&
                    Number.isFinite(Number(inner?.seconds))
                      ? Number(inner.seconds)
                      : null,
                  rawType: msgType,
                  forwarded: isForwarded,
                  forwarding_score:
                    Number(contextInfo?.forwardingScore || 0) || 0,
                };
              }
            } catch {
              // ignore download errors
            }
          }

          const stored = await storeMessage({
            organization_id: orgId,
            contact_id: contact.id,
            conversation_id: conv.id,
            wa_message_id: msg.key.id || null,
            direction,
            type: normalizedType,
            content: enrichedContent,
            status: isOutbound ? "sent" : "delivered",
            sender_type: isOutbound ? "human_agent" : "customer",
            automation_source: isOutbound ? "manual" : "webhook",
          });

          // 4) Emit only realtime (not history sync)
          if (!isHistorySync) {
            io.emit("new_message", {
              from: contactWaId,
              name: threadName || senderName,
              text: captionText,
              forwarded: isForwarded,
              type: normalizedType,
              ...(enrichedContent?.media_url
                ? { media_url: enrichedContent.media_url }
                : {}),
              ...(enrichedContent?.mime_type
                ? { mime_type: enrichedContent.mime_type }
                : {}),
              ...(enrichedContent?.file_name
                ? { file_name: enrichedContent.file_name }
                : {}),
              timestamp: new Date().toISOString(),
              connectedAccount: myPhone,
              contact_id: contact.id,
              conversation_id: conv.id,
              message_id: stored?.id || null,
              wa_message_id: msg.key.id || null,
              created_at: stored?.created_at || new Date().toISOString(),
              sender: isOutbound ? "agent" : "user",
              status: isOutbound ? "sent" : "delivered",
            });

            // Bot Auto-Reply for Baileys (only for inbound text messages)
            if (!isOutbound && normalizedType === "text" && captionText) {
              try {
                let flowConsumedMessage = false;
                const flowResult = await processFlowEngine(
                  orgId,
                  contact.id,
                  conv.id,
                  captionText,
                  stored?.id || null,
                  conv.wa_account_id || null,
                );

                if (flowResult?.consumed) {
                  flowConsumedMessage = true;

                  if (flowResult.output) {
                    console.log(
                      `ðŸŒŠ Flow Engine (Baileys) replying to: "${captionText.substring(0, 50)}..."`,
                    );
                    const botMsg = await sock.sendMessage(remoteJid, {
                      text: flowResult.output,
                    });
                    const botWaMessageId = botMsg?.key?.id || null;

                    const storedBotReply = await storeMessage({
                      organization_id: orgId,
                      contact_id: contact.id,
                      conversation_id: conv.id,
                      wa_message_id: botWaMessageId,
                      direction: "outbound",
                      type: "text",
                      content: { text: flowResult.output, is_flow: true },
                      status: "sent",
                      is_bot_reply: true,
                      sender_type: "ai_agent",
                      automation_source: "flow",
                      metadata: {
                        flow_id: flowResult.flow_id,
                        flow_version_id: flowResult.flow_version_id,
                        flow_session_id: flowResult.flow_session_id,
                        flow_run_id: flowResult.flow_run_id,
                        flow_node_id: flowResult.flow_node_id,
                        handoff: flowResult.handoff === true,
                      },
                    } as any);

                    io.emit("new_message", {
                      from: myPhone,
                      phone: contactWaId,
                      text: flowResult.output,
                      sender: "agent",
                      conversation_id: conv.id,
                      contact_id: contact.id,
                      message_id: storedBotReply?.id || null,
                      wa_message_id: botWaMessageId,
                      created_at:
                        storedBotReply?.created_at || new Date().toISOString(),
                      connectedAccount: myPhone,
                      type: "text",
                      is_bot_reply: true,
                    });

                    await supabase
                      .from("w_conversations")
                      .update({
                        last_message_at: new Date().toISOString(),
                        last_message_preview: flowResult.output.substring(
                          0,
                          100,
                        ),
                      })
                      .eq("id", conv.id);
                  }

                  if (
                    Array.isArray(flowResult.media) &&
                    flowResult.media.length > 0
                  ) {
                    for (const media of flowResult.media) {
                      try {
                        let botMsg: any = null;
                        if (media.type === "image")
                          botMsg = await sock.sendMessage(remoteJid, {
                            image: { url: media.url },
                            caption: media.caption || undefined,
                          });
                        else if (media.type === "video")
                          botMsg = await sock.sendMessage(remoteJid, {
                            video: { url: media.url },
                            caption: media.caption || undefined,
                          });
                        else if (media.type === "audio")
                          botMsg = await sock.sendMessage(remoteJid, {
                            audio: { url: media.url },
                            mimetype: media.mimeType || "audio/mpeg",
                          });
                        else
                          botMsg = await sock.sendMessage(remoteJid, {
                            document: { url: media.url },
                            fileName: media.fileName || "document",
                            mimetype:
                              media.mimeType || "application/octet-stream",
                            caption: media.caption || undefined,
                          });

                        const botWaMessageId = botMsg?.key?.id || null;
                        const preview =
                          media.caption ||
                          (media.type === "image"
                            ? "[Image]"
                            : media.type === "video"
                              ? "[Video]"
                              : media.type === "audio"
                                ? "[Audio]"
                                : "[Document]");

                        const storedBotMedia = await storeMessage({
                          organization_id: orgId,
                          contact_id: contact.id,
                          conversation_id: conv.id,
                          wa_message_id: botWaMessageId,
                          direction: "outbound",
                          type: media.type,
                          content: {
                            text: media.caption || null,
                            media_url: media.url,
                            mime_type: media.mimeType || null,
                            file_name: media.fileName || null,
                            is_flow: true,
                          },
                          status: "sent",
                          is_bot_reply: true,
                          sender_type: "ai_agent",
                          automation_source: "flow",
                          metadata: {
                            flow_id: flowResult.flow_id,
                            flow_version_id: flowResult.flow_version_id,
                            flow_session_id: flowResult.flow_session_id,
                            flow_run_id: flowResult.flow_run_id,
                            flow_node_id: flowResult.flow_node_id,
                            handoff: flowResult.handoff === true,
                          },
                        } as any);

                        io.emit("new_message", {
                          from: myPhone,
                          phone: contactWaId,
                          text: preview,
                          sender: "agent",
                          conversation_id: conv.id,
                          contact_id: contact.id,
                          message_id: storedBotMedia?.id || null,
                          wa_message_id: botWaMessageId,
                          created_at:
                            storedBotMedia?.created_at ||
                            new Date().toISOString(),
                          connectedAccount: myPhone,
                          type: media.type,
                          media_url: media.url,
                          mime_type: media.mimeType || null,
                          file_name: media.fileName || null,
                          is_bot_reply: true,
                        });

                        await supabase
                          .from("w_conversations")
                          .update({
                            last_message_at: new Date().toISOString(),
                            last_message_preview: preview.substring(0, 100),
                          })
                          .eq("id", conv.id);
                      } catch (mediaErr: any) {
                        console.error(
                          "[Flow] Failed to send Baileys media node:",
                          mediaErr?.message || mediaErr,
                        );
                      }
                    }
                  }
                }

                if (!flowConsumedMessage) {
                  const botResult = await getBotAgentReply({
                    organization_id: orgId,
                    conversation_id: conv.id,
                    text: captionText,
                  });

                  if (botResult?.reply) {
                    console.log(
                      `ðŸ¤– Bot "${botResult.agent?.name}" replying via Baileys to: "${captionText.substring(0, 50)}..."`,
                    );

                    // Send the reply via Baileys
                    const botMsg = await sock.sendMessage(remoteJid, {
                      text: botResult.reply,
                    });
                    const botWaMessageId = botMsg?.key?.id || null;

                    // Store the bot's reply message
                    const storedBotReply = await storeMessage({
                      organization_id: orgId,
                      contact_id: contact.id,
                      conversation_id: conv.id,
                      wa_message_id: botWaMessageId,
                      direction: "outbound",
                      type: "text",
                      content: {
                        text: botResult.reply,
                        bot_agent_id: botResult.agent?.id,
                        bot_agent_name: botResult.agent?.name,
                      },
                      status: "sent",
                      is_bot_reply: true,
                      bot_agent_id: botResult.agent?.id || null,
                      sender_type: "ai_agent",
                      automation_source: "ai_agent",
                    } as any);

                    // Emit the bot reply to frontend
                    io.emit("new_message", {
                      from: myPhone,
                      phone: contactWaId,
                      text: botResult.reply,
                      sender: "agent",
                      conversation_id: conv.id,
                      contact_id: contact.id,
                      message_id: storedBotReply?.id || null,
                      wa_message_id: botWaMessageId,
                      created_at:
                        storedBotReply?.created_at || new Date().toISOString(),
                      connectedAccount: myPhone,
                      type: "text",
                      is_bot_reply: true,
                      bot_agent_name: botResult.agent?.name,
                    });

                    // Update conversation preview
                    await supabase
                      .from("w_conversations")
                      .update({
                        last_message_at: new Date().toISOString(),
                        last_message_preview: botResult.reply.substring(0, 100),
                      })
                      .eq("id", conv.id);
                  }
                }
              } catch (botErr: any) {
                console.error(
                  "Bot auto-reply error (Baileys):",
                  botErr.message || botErr,
                );
              }
            }
          }
        } catch (err) {
          console.error("Error processing message:", err);
        }
      }
    });

    // âœ… NEW: Listen for status updates (Read Receipts / Delivery)
    sock.ev.on("messages.update", async (updates) => {
      for (const update of updates) {
        // update.update.status: 3=delivered, 4=read/played
        const statusRaw = update.update.status;
        if (!statusRaw) continue;

        let newStatus = null;
        if (statusRaw === 3) newStatus = "delivered";
        else if (statusRaw >= 4) newStatus = "read";

        if (newStatus && update.key.id) {
          // Update DB
          const orgId = await ensureDefaultOrganizationId();
          if (orgId) {
            await supabase
              .from("w_messages")
              .update({ status: newStatus })
              .eq("wa_message_id", update.key.id);
          }

          // Emit to frontend
          io.emit("message_status_update", {
            wa_message_id: update.key.id,
            status: newStatus,
          });
          console.log(`Updated status for ${update.key.id} -> ${newStatus}`);
        }
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Always cache QR, but only emit if the frontend explicitly requested it.
        latestQrBySession.set(sessionId, { qr, createdAt: Date.now() });

        const requested = Boolean(
          socket?.data?.qrRequestedSessions &&
          typeof socket.data.qrRequestedSessions?.has === "function" &&
          socket.data.qrRequestedSessions.has(sessionId),
        );

        if (requested) {
          socket.emit("qr", qr);
          console.log("QR Code sent to client");
        } else {
          console.log("QR generated but not requested; cached for later");
        }
        initializingSessions.delete(sessionId); // Unlock on QR (user needs to scan)
      }

      if (connection === "close") {
        initializingSessions.delete(sessionId); // Unlock

        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const error = lastDisconnect?.error as any;
        const errorMsg = error?.message || "";

        // Check for critical session corruption errors
        const isBadSession =
          statusCode === DisconnectReason.badSession ||
          statusCode === DisconnectReason.connectionClosed || // Often means bad session state
          statusCode === 428 || // Precondition Required (often Boom error)
          errorMsg.includes("Bad MAC") ||
          errorMsg.includes("pre-key") ||
          errorMsg.includes("Connection Closed");

        if (isBadSession) {
          console.error(
            `âŒ Critical Session Error (${statusCode || errorMsg}). Clearing session...`,
          );
          // Clear only THIS session directory to force fresh scan (not all sessions!)
          try {
            const sessionDir = `baileys_auth_info/${sessionId}`;
            fs.rmSync(sessionDir, { recursive: true, force: true });
            sessions.delete(sessionId);
            socket.emit("status", "ready"); // Ensure UI resets to QR generate state
            socket.emit("session_cleared", {
              reason: errorMsg || "Session corrupted",
            });
            console.log(`âœ… Session ${sessionId} cleared. User must re-scan.`);
          } catch (e) {
            console.error("Failed to clear session:", e);
          }
          return; // Stop here
        }

        // CRITICAL FIX: Don't reconnect on conflict (440) or if logged out
        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut && statusCode !== 440; // 440 = Stream Errored (conflict)

        console.log(
          "connection closed due to ",
          lastDisconnect?.error,
          ", status code:",
          statusCode,
          ", reconnecting:",
          shouldReconnect,
        );

        // Remove from sessions map
        sessions.delete(sessionId);
        socket.emit("status", "disconnected");

        if (shouldReconnect) {
          // Get current attempt count
          const attempts = reconnectAttempts.get(sessionId) || 0;

          if (attempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log(
              `âŒ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${sessionId}. Stopping.`,
            );
            reconnectAttempts.delete(sessionId);
            socket.emit("status", "idle");
            socket.emit("reconnect_failed", {
              reason: "Max attempts reached. Please reconnect manually.",
            });
            return;
          }

          // Exponential backoff: 3s, 6s, 12s, 24s, 48s
          const delay = 3000 * Math.pow(2, attempts);
          reconnectAttempts.set(sessionId, attempts + 1);

          console.log(
            `â³ Reconnect attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s...`,
          );
          setTimeout(() => {
            setupBaileys(sessionId, socket);
          }, delay);
        } else {
          console.log(
            "âŒ Not reconnecting. User needs to scan QR again or logout detected.",
          );
          reconnectAttempts.delete(sessionId); // Reset on deliberate disconnect
          if (statusCode === 440) {
            console.log(
              "âš ï¸ Conflict detected. Another WhatsApp Web session might be active.",
            );
            socket.emit("conflict_detected", {
              message:
                "Another WhatsApp Web session is active. Close it and reconnect.",
            });
          }
          if (statusCode === DisconnectReason.loggedOut) {
            // Clear session files on logout
            try {
              const sessionDir = `baileys_auth_info/${sessionId}`;
              fs.rmSync(sessionDir, { recursive: true, force: true });
              console.log(`âœ… Session ${sessionId} cleared after logout.`);
            } catch (e) {
              console.error("Failed to clear session on logout:", e);
            }
          }
        }
      } else if (connection === "open") {
        console.log("âœ… WhatsApp connection established successfully");
        initializingSessions.delete(sessionId); // Unlock
        reconnectAttempts.delete(sessionId); // Reset on successful connect
        socket.emit("status", "connected");

        // âœ… Emit connected account info immediately
        const connectedJid = sock.user?.id || "";
        const connectedAccount = connectedJid
          ? connectedJid.split(":")[0]
          : null;

        const orgId = organization_id || (await ensureDefaultOrganizationId());
        if (connectedAccount && orgId) {
          // âœ… UPSERT into wa_accounts so we have a valid ID for FKs
          try {
            await supabase.from("w_wa_accounts").upsert(
              {
                organization_id: orgId,
                phone_number_id: connectedAccount,
                display_phone_number: connectedAccount, // Use phone as display name defaults
                status: "connected",
                // waba_id: null // Not available in Baileys
              },
              { onConflict: "phone_number_id" },
            );
            console.log(`âœ… Upserted wa_account for ${connectedAccount}`);
          } catch (err) {
            console.error("Failed to upsert wa_account:", err);
          }
        }

        if (connectedAccount) {
          socket.emit("connected_account", connectedAccount);
        }
      }
    });

    // Final Guard: If we're no longer in initializingSessions, it means we aborted or logged out mid-flow
    if (!initializingSessions.has(sessionId)) {
      console.log(
        `âš ï¸ Session ${sessionId} initialization aborted (likely logout). Not setting session.`,
      );
      try {
        sock.end(undefined);
      } catch (e) {}
      return;
    }

    sessions.set(sessionId, sock);
    return sock;
  } catch (err) {
    console.error("Setup failed:", err);
    initializingSessions.delete(sessionId);
  }
}

// Global Error Handlers to prevent crash
process.on("uncaughtException", (err: any) => {
  console.error("âŒ Uncaught Exception:", err);
  // If it's the known connection crash, try to handle it
  if (
    err.message &&
    (err.message.includes("Connection Closed") ||
      err.message.includes("Bad MAC"))
  ) {
    console.log("âš ï¸ Caught fatal session error. Cleaning up...");
    try {
      if (fs.existsSync("baileys_auth_info")) {
        fs.rmSync("baileys_auth_info", { recursive: true, force: true });
        console.log("âœ… Corrupted session cleared.");
      }
    } catch (e) {
      console.error("Cleanup failed:", e);
    }
  }
});

process.on("unhandledRejection", (reason: any, promise) => {
  console.error("âŒ Unhandled Rejection:", reason);
  if (
    reason &&
    (reason.output?.statusCode === 428 ||
      reason.message?.includes("Connection Closed"))
  ) {
    console.log("âš ï¸ Caught Fatal Boom Error (428). Cleaning up session...");
    try {
      if (fs.existsSync("baileys_auth_info")) {
        fs.rmSync("baileys_auth_info", { recursive: true, force: true });
        console.log("âœ… Corrupted session cleared.");
      }
    } catch (e) {
      console.error("Cleanup failed:", e);
    }
  }
});

io.on("connection", (socket) => {
  console.log("✅ Frontend connected:", socket.id);

  // Join organization-specific room for multi-tenancy
  socket.on("join_org", (orgId: string) => {
    if (orgId) {
      console.log(`👤 Client ${socket.id} joining room: org:${orgId}`);
      socket.join(`org:${orgId}`);
    }
  });

  // Track explicit QR requests per socket.
  socket.data = socket.data || {};
  socket.data.qrRequestedSessions =
    socket.data.qrRequestedSessions || new Set<string>();

  // Frontend requests to join/init a session
  socket.on("join_session", async (sessionId: string, orgId?: string) => {
    console.log(`Client ${socket.id} checking session ${sessionId}`);
    if (orgId) socket.data.organization_id = orgId;

    // Check if session exists in memory; if not, try restoring from disk.
    const existing = sessions.get(sessionId);
    if (existing && existing?.user?.id) {
      console.log(`âœ… Reusing existing session for ${sessionId}`);
      socket.emit("status", "connected");

      // âœ… Emit connected account info immediately
      const connectedJid = existing.user?.id || "";
      const connectedAccount = connectedJid ? connectedJid.split(":")[0] : null;
      if (connectedAccount) {
        let existingOrgId = socket?.data?.organization_id || null;
        const sessionOrgFile = `baileys_auth_info/${sessionId}/org_id.txt`;
        if (!existingOrgId && fs.existsSync(sessionOrgFile)) {
          existingOrgId = fs.readFileSync(sessionOrgFile, "utf8").trim();
        }
        await upsertBaileysWaAccount(existingOrgId, connectedAccount);
        socket.emit("connected_account", connectedAccount);
      }
    } else {
      if (existing && !existing?.user?.id) {
        console.log(
          `â„¹ï¸ Session ${sessionId} exists but not connected yet. Emitting scanning status.`,
        );
        socket.emit("status", "scanning");

        // If a QR is already generated but connection isn't open, resend the QR
        const cached = latestQrBySession.get(sessionId);
        if (cached?.qr) {
          socket.emit("qr", cached.qr);
        }
        return;
      }

      // If the session exists on disk (e.g. server restart), restore it.
      // QR may be generated by Baileys if creds are invalid, but QR emission is gated.
      try {
        const sessionDir = `baileys_auth_info/${sessionId}`;
        if (!sessions.get(sessionId) && fs.existsSync(sessionDir)) {
          console.log(`ðŸ”„ Restoring Baileys session from disk: ${sessionId}`);
          await setupBaileys(sessionId, socket);
          return;
        }
      } catch {
        // ignore
      }

      console.log(
        `â„¹ï¸ No active connected session for ${sessionId}. Waiting for QR request...`,
      );
      socket.emit("session_not_found"); // Trigger frontend to request QR
    }
  });

  // NEW: Explicit QR generation request
  socket.on("request_qr", async (sessionId: string, orgId?: string) => {
    console.log(
      `🔔 QR generation requested for session ${sessionId} (Org: ${orgId || "None"})`,
    );
    if (orgId) socket.data.organization_id = orgId;

    // Kill any existing session to ensure a clean slate for fresh QR
    const existing = sessions.get(sessionId);
    if (existing) {
      console.log(
        `âš ï¸ Killing existing session ${sessionId} to force fresh QR scan.`,
      );
      try {
        existing.end(undefined);
      } catch (e) {}
      sessions.delete(sessionId);
      initializingSessions.delete(sessionId);
      reconnectAttempts.delete(sessionId);
      latestQrBySession.delete(sessionId);
    }

    socket.data.qrRequestedSessions.add(sessionId);

    // If we already have a cached QR for this session, emit it immediately.
    const cached = latestQrBySession.get(sessionId);
    if (cached?.qr) {
      socket.emit("qr", cached.qr);
    }

    // Create new Baileys session
    await setupBaileys(sessionId, socket, orgId || socket.data.organization_id);
  });

  // NEW: Explicit Logout request
  socket.on("logout", async (sessionId: string) => {
    console.log(`Logout requested for session ${sessionId}`);

    // Clear all tracking maps for this session
    initializingSessions.delete(sessionId);
    reconnectAttempts.delete(sessionId);
    latestQrBySession.delete(sessionId);

    const sock = sessions.get(sessionId);
    let phoneToDisconnect = null;
    if (sock) {
      // Get phone before ending connection to update DB
      const jid = sock.user?.id || "";
      phoneToDisconnect = jid ? jid.split(":")[0] : null;

      try {
        // sock.logout() sends a message to WhatsApp to invalidate the session
        await sock.logout();
        sock.end(undefined);
      } catch (e) {
        console.error("Baileys logout error:", e);
      }
      sessions.delete(sessionId);
    }

    // Update database if we found a phone number
    if (phoneToDisconnect && supabase) {
      console.log(
        `Updating DB: Setting account ${phoneToDisconnect} to disconnected.`,
      );
      try {
        await supabase
          .from("w_wa_accounts")
          .update({ status: "disconnected" })
          .eq("phone_number_id", phoneToDisconnect);
      } catch (err) {
        console.error("Failed to update wa_account status on logout:", err);
      }
    }

    const sessionDir = `baileys_auth_info/${sessionId}`;
    if (fs.existsSync(sessionDir)) {
      // Delay to resolve file locks
      setTimeout(() => {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(
            `âœ… Session directory ${sessionId} cleared on request. Chat data remains in DB.`,
          );
        } catch (e) {}
      }, 500);
    }

    socket.emit("status", "ready");
  });

  socket.on("disconnect", () =>
    console.log("âŒ Frontend disconnected:", socket.id),
  );
});

httpServer.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`âŒ Port ${PORT} is already in use.`);
    console.error(
      "Close the other running server, or start with a different port.",
    );
    console.error("Example (PowerShell): $env:PORT=3002; npm run dev");
    process.exit(1);
  }
  console.error("âŒ Server error:", err);
  process.exit(1);
});

// ====== Broadcast APIs ======

// GET /api/broadcast/tags
app.get("/api/broadcast/tags", authMiddleware, async (req, res) => {
  const orgId = (req as any).organization_id;
  try {
    const { data: contacts, error: fetchErr } = await supabase
      .from("w_contacts")
      .select("tags")
      .eq("organization_id", orgId);

    if (fetchErr) throw fetchErr;

    const tagsSet = new Set<string>();
    contacts?.forEach((c: any) => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach((t: string) => tagsSet.add(t));
      }
    });

    res.json({ tags: Array.from(tagsSet) });
  } catch (err: any) {
    console.error("Fetch Tags Error:", err);
    res.status(500).json({ error: err.message });
  }
});

async function processCampaign(campaign: any) {
  try {
    const originalVariableMapping = campaign?.variable_mapping || {};
    const { data: freshCampaign, error: freshCampaignErr } = await supabase
      .from("w_campaigns")
      .select("*")
      .eq("id", campaign.id)
      .maybeSingle();

    if (freshCampaignErr) {
      console.warn(
        "[processCampaign] Could not refetch campaign before processing:",
        freshCampaignErr.message,
      );
    } else if (freshCampaign) {
      const freshMapping = freshCampaign.variable_mapping || {};
      const originalHeaderMedia = normalizeTemplateHeaderMedia(
        originalVariableMapping,
      );
      const freshHeaderMedia = normalizeTemplateHeaderMedia(freshMapping);

      campaign = { ...campaign, ...freshCampaign };

      if (originalHeaderMedia.url && !freshHeaderMedia.url) {
        campaign.variable_mapping = {
          ...freshMapping,
          ...originalVariableMapping,
        };
        console.warn(
          "[processCampaign] DB campaign mapping was missing header media; using launch payload mapping",
          {
            campaign_id: campaign.id,
            template_name: campaign.template_name,
            header_media_type: originalHeaderMedia.type,
            header_media_url: originalHeaderMedia.url,
          },
        );
      }
    }

    await supabase
      .from("w_campaigns")
      .update({ status: "processing" })
      .eq("id", campaign.id);

    const orgId = campaign.organization_id;
    const wa_account_id = campaign.wa_account_id;

    const { data: account, error: accErr } = await supabase
      .from("w_wa_accounts")
      .select(
        "id, phone_number_id, whatsapp_business_account_id, access_token_encrypted",
      )
      .eq("id", wa_account_id)
      .single();

    if (accErr || !account) throw new Error("WhatsApp account not found");
    const token = decryptToken(account.access_token_encrypted);
    const phone_number_id = account.phone_number_id;

    let contactsToProcess = [];
    if (campaign.csv_data && Array.isArray(campaign.csv_data)) {
      contactsToProcess = campaign.csv_data;
    } else {
      let query = supabase
        .from("w_contacts")
        .select("id, name, custom_name, phone, wa_id, tags")
        .eq("organization_id", orgId)
        .eq("contact_type", "individual");

      const audienceType = campaign.variable_mapping?._audience_type || "all";

      if (audienceType === "saved") {
        query = query.not("saved_at", "is", null);
      } else if (audienceType === "tag" && campaign.audience_tag) {
        query = query.contains("tags", [campaign.audience_tag]);
      } else if (campaign.audience_tag) {
        // Fallback for old behaviour
        query = query.contains("tags", [campaign.audience_tag]);
      }

      const { data: contacts, error: contactsErr } = await query;
      if (contactsErr) throw contactsErr;
      contactsToProcess = contacts || [];
    }

    if (contactsToProcess.length === 0) {
      await supabase
        .from("w_campaigns")
        .update({ status: "completed", total_contacts: 0 })
        .eq("id", campaign.id);
      return;
    }

    const billingCategory = normalizeWhatsappBillingCategory(
      campaign.billing_category ||
        campaign.variable_mapping?._template_category,
      "marketing",
    );
    const campaignRate = await getActiveWhatsappRate(billingCategory);
    const estimatedCost =
      contactsToProcess.length * Number(campaignRate.rate_paise || 0);
    await supabase
      .from("w_campaigns")
      .update({
        billing_category: billingCategory,
        estimated_cost_paise: estimatedCost,
        billing_status: estimatedCost > 0 ? "estimated" : "charged",
      })
      .eq("id", campaign.id);

    let sent = 0;
    let failed = 0;
    let processed = 0;
    let isCancelled = false;
    const results = [];

    for (const contact of contactsToProcess) {
      processed++;
      if (processed % 10 === 0) {
        const { data: checkCamp } = await supabase
          .from("w_campaigns")
          .select("status")
          .eq("id", campaign.id)
          .maybeSingle();
        if (
          checkCamp &&
          (checkCamp.status === "cancelled" || checkCamp.status === "paused")
        ) {
          isCancelled = true;
          console.log(
            `[processCampaign] Campaign ${campaign.id} was cancelled/paused. Stopping.`,
          );
          break;
        }
      }
      const recipient = contact.phone || contact.wa_id;
      if (!recipient) {
        failed++;
        results.push({
          phone: null,
          name: contact.name || "Unknown",
          status: "failed",
          error: "Missing phone number",
        });
        continue;
      }

      const components = [];
      const mapping = campaign.variable_mapping || {};

      let renderedText =
        mapping._template_body ||
        `[Broadcast Template: ${campaign.template_name}]`;
      const parameters = [];
      const { type: headerMediaType, url: headerMediaUrl } =
        normalizeTemplateHeaderMedia(mapping);

      if (headerMediaType && !headerMediaUrl) {
        failed++;
        results.push({
          phone: recipient,
          name: contact.name || contact.custom_name || "Unknown",
          status: "failed",
          error: `Missing required ${headerMediaType} header media URL`,
        });
        continue;
      }

      if (headerMediaType && headerMediaUrl) {
        components.push({
          type: "header",
          parameters: [
            {
              type: headerMediaType,
              [headerMediaType]: { link: headerMediaUrl },
            },
          ],
        });
      }

      const buttonUrlKeys = Object.keys(mapping)
        .map((key) => {
          const match = key.match(/^_?button_url_(\d+)$/);
          return match ? { key, index: match[1] } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => parseInt(a.index) - parseInt(b.index));

      const addedButtonIndexes = new Set<string>();
      for (const item of buttonUrlKeys as any[]) {
        if (addedButtonIndexes.has(item.index)) continue;
        const text = String(
          mapping[`_button_url_${item.index}`] ||
            mapping[`button_url_${item.index}`] ||
            "",
        ).trim();
        if (!text) continue;

        components.push({
          type: "button",
          sub_type: "url",
          index: item.index,
          parameters: [{ type: "text", text }],
        });
        addedButtonIndexes.add(item.index);
      }

      const templateVariableKeys = Array.isArray(mapping._template_variables)
        ? mapping._template_variables
            .map((key: any) => String(key).trim())
            .filter(Boolean)
        : [...String(renderedText || "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
            .map((match) => String(match[1] || "").trim())
            .filter(Boolean);
      const sortedKeys = [
        ...new Set<string>(
          templateVariableKeys.length
            ? templateVariableKeys
            : Object.keys(mapping)
                .filter((k) => /^\d+$/.test(k))
                .sort((a, b) => parseInt(a) - parseInt(b)),
        ),
      ];

      for (const key of sortedKeys) {
        const field = mapping[key];
        let text = "";
        if (field === "name") text = contact.custom_name || contact.name || "";
        else if (field === "phone") text = contact.phone || "";
        else text = field || "";

        renderedText = renderedText.replace(
          new RegExp(
            `\\{\\{\\s*${String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`,
            "g",
          ),
          text,
        );
        const parameter: any = { type: "text", text: text || " " };
        if (!/^\d+$/.test(String(key))) {
          parameter.parameter_name = String(key);
        }
        parameters.push(parameter);
      }

      if (parameters.length > 0) {
        components.push({ type: "body", parameters });
      }

      const payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: {
          name: campaign.template_name,
          language: { code: campaign.template_language },
          components: components,
        },
      };

      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        const data = await response.json();

        if (response.ok) {
          sent++;
          results.push({
            phone: recipient,
            name: contact.name || contact.custom_name || "Unknown",
            status: "sent",
          });

          const wa_message_id = data.messages?.[0]?.id;
          const realWaId = data.contacts?.[0]?.wa_id || recipient;

          let currentContactId = contact.id;

          if (!currentContactId) {
            // First check if contact exists by real WhatsApp ID or the passed phone
            const { data: existingContacts } = await supabase
              .from("w_contacts")
              .select("id")
              .eq("organization_id", orgId)
              .or(`wa_id.eq.${realWaId},phone.eq.${recipient}`)
              .limit(1);

            if (existingContacts && existingContacts.length > 0) {
              currentContactId = existingContacts[0].id;
            } else {
              const { data: newContact, error: insertErr } = await supabase
                .from("w_contacts")
                .insert({
                  organization_id: orgId,
                  wa_account_id: wa_account_id,
                  name: contact.name || contact.custom_name || recipient,
                  phone: recipient,
                  wa_id: realWaId,
                  contact_type: "individual",
                })
                .select("id")
                .single();

              if (newContact) {
                currentContactId = newContact.id;
              }
            }
          }

          if (currentContactId) {
            const conv = await upsertConversation(
              orgId,
              wa_account_id,
              currentContactId,
              {
                lastMessagePreview: `[Broadcast] ${campaign.template_name}`,
              },
            );

            if (conv && conv.id) {
              const templateButtons = Array.isArray(mapping._template_buttons)
                ? mapping._template_buttons
                    .map((button: any) => {
                      const type = String(button?.type || "").toUpperCase();
                      const buttonValue =
                        mapping[`_button_url_${button.index}`] ||
                        mapping[`button_url_${button.index}`] ||
                        "";
                      return {
                        index: button.index,
                        type,
                        text:
                          button?.text ||
                          `Button ${Number(button.index || 0) + 1}`,
                        url:
                          type === "URL"
                            ? resolveTemplateButtonUrl(button?.url, buttonValue)
                            : "",
                        phone_number:
                          type === "PHONE_NUMBER"
                            ? button?.phone_number || ""
                            : "",
                      };
                    })
                    .filter((button: any) => button.text)
                : [];

              const storedMessage = await storeMessage({
                organization_id: orgId,
                conversation_id: conv.id,
                contact_id: currentContactId,
                wa_message_id: wa_message_id || `broadcast-${Date.now()}`,
                direction: "outbound",
                type: "template",
                status: "sent",
                content: {
                  text: renderedText,
                  template: {
                    name: campaign.template_name,
                    language: campaign.template_language,
                    body: renderedText,
                    footer: mapping._template_footer || "",
                    header: headerMediaUrl
                      ? {
                          type: headerMediaType,
                          media_url: headerMediaUrl,
                        }
                      : null,
                    buttons: templateButtons,
                  },
                },
                sender_type: "system",
                automation_source: "broadcast",
              });

              await recordWhatsappMessageUsage({
                organization_id: orgId,
                wa_account_id,
                campaign_id: campaign.id,
                conversation_id: conv.id,
                contact_id: currentContactId,
                message_id: storedMessage?.id || null,
                wa_message_id: wa_message_id || null,
                category: billingCategory,
                template_name: campaign.template_name,
                source: "broadcast",
              });
            }
          }
        } else {
          failed++;
          console.error("[processCampaign] Meta template send failed", {
            campaign_id: campaign.id,
            template_name: campaign.template_name,
            recipient,
            error: data.error,
            components: payload.template.components,
          });
          results.push({
            phone: recipient,
            name: contact.name || contact.custom_name || "Unknown",
            status: "failed",
            error: getMetaSendErrorMessage(data.error),
          });
        }
      } catch (e: any) {
        failed++;
        results.push({
          phone: recipient,
          name: contact.name || contact.custom_name || "Unknown",
          status: "failed",
          error: e.message || "Network/Unknown Error",
        });
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    await supabase
      .from("w_campaigns")
      .update({
        status: isCancelled ? "cancelled" : "completed",
        total_contacts: contactsToProcess.length,
        sent_count: sent,
        failed_count: failed,
        results: results,
      })
      .eq("id", campaign.id);

    await supabase
      .from("w_campaigns")
      .update({
        actual_cost_paise: sent * Number(campaignRate.rate_paise || 0),
        billing_status:
          failed === contactsToProcess.length ? "failed" : "charged",
      })
      .eq("id", campaign.id);
  } catch (err) {
    console.error("Error processing campaign:", campaign.id, err);
    await supabase
      .from("w_campaigns")
      .update({ status: "failed" })
      .eq("id", campaign.id);
  }
}

// Background scheduler
setInterval(async () => {
  try {
    const { data: campaigns, error } = await supabase
      .from("w_campaigns")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (error || !campaigns) return;

    for (const camp of campaigns) {
      processCampaign(camp); // runs asynchronously
    }
  } catch (e) {
    // ignore
  }
}, 60000); // Check every minute

// POST /api/broadcast/send
app.post(
  "/api/broadcast/header-media",
  authMiddleware,
  upload.single("file"),
  async (req: any, res) => {
    const orgId = req.organization_id;
    const file = req.file;

    try {
      if (!orgId) {
        return res.status(400).json({ error: "organization_id is required" });
      }
      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }

      const uploaded = await uploadMediaToStorage({
        organization_id: orgId,
        conversation_id: "broadcast-template-headers",
        fileName: file.originalname || `template-header-${crypto.randomUUID()}`,
        mimeType: file.mimetype || "application/octet-stream",
        buffer: file.buffer,
      });

      res.json(uploaded);
    } catch (err: any) {
      console.error("Broadcast header media upload error:", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to upload header media" });
    }
  },
);

app.post("/api/broadcast/estimate", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  const { audience_tag, audience_type, csv_data, template_category } =
    req.body || {};

  try {
    if (!orgId)
      return res.status(400).json({ error: "organization_id is required" });
    const estimate = await buildBroadcastBillingEstimate({
      organization_id: orgId,
      audience_tag: audience_tag || null,
      audience_type: audience_type || null,
      csv_data: Array.isArray(csv_data) ? csv_data : null,
      template_category,
    });
    res.json(estimate);
  } catch (err: any) {
    console.error("[broadcast/estimate] Error:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to estimate broadcast cost" });
  }
});

app.post("/api/broadcast/send", authMiddleware, async (req, res) => {
  const orgId = (req as any).organization_id;
  const {
    name,
    wa_account_id,
    audience_tag,
    csv_data,
    template_name,
    template_language,
    variable_mapping,
    scheduled_at,
    required_header_type,
    header_media_type,
    header_media_url,
  } = req.body;

  try {
    if (!wa_account_id || !template_name || !template_language) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const variableMapping =
      variable_mapping && typeof variable_mapping === "object"
        ? { ...variable_mapping }
        : {};
    if (header_media_url) {
      const mediaType = String(
        header_media_type ||
          variableMapping.header_media_type ||
          variableMapping._header_media_type ||
          "image",
      ).toLowerCase();
      variableMapping._header_media_type = mediaType;
      variableMapping._header_media_url = header_media_url;
      variableMapping.header_media_type = mediaType;
      variableMapping.header_media_url = header_media_url;
    }

    const requiredHeaderTypeFromClient = String(
      required_header_type || "",
    ).toLowerCase();
    if (["image", "video", "document"].includes(requiredHeaderTypeFromClient)) {
      const { type: headerMediaType, url: headerMediaUrl } =
        normalizeTemplateHeaderMedia(
          variableMapping,
          requiredHeaderTypeFromClient,
        );
      if (!headerMediaUrl) {
        return res.status(400).json({
          error: `Template "${template_name}" requires a ${requiredHeaderTypeFromClient} header media URL. Upload media or paste a public URL before launching.`,
        });
      }

      variableMapping._header_media_type = requiredHeaderTypeFromClient;
      variableMapping._header_media_url = headerMediaUrl;
      variableMapping.header_media_type = requiredHeaderTypeFromClient;
      variableMapping.header_media_url = headerMediaUrl;
    }

    const { data: account, error: accountErr } = await supabase
      .from("w_wa_accounts")
      .select(
        "id, phone_number_id, access_token_encrypted, whatsapp_business_account_id",
      )
      .eq("id", wa_account_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (accountErr) throw accountErr;
    if (!account?.id)
      return res
        .status(400)
        .json({ error: "Selected WhatsApp account was not found" });
    if (!account.access_token_encrypted)
      return res
        .status(400)
        .json({
          error:
            "Selected WhatsApp account is missing a Meta access token. Reconnect this account.",
        });

    const token = decryptToken(account.access_token_encrypted);
    const tokenInspection = await inspectMetaTokenPermissions(token);
    if (tokenInspection.checked && tokenInspection.missingScopes.length > 0) {
      return res.status(400).json({
        error: `Selected WhatsApp account token is missing required Meta permission(s): ${tokenInspection.missingScopes.join(", ")}. Reconnect using a System User or embedded signup token with whatsapp_business_messaging and whatsapp_business_management.`,
      });
    }
    if (tokenInspection.error) {
      console.warn(
        "[broadcast/send] Could not inspect Meta token permissions:",
        tokenInspection.error,
      );
    }

    if (account.whatsapp_business_account_id) {
      const tplRes = await fetch(
        `https://graph.facebook.com/v20.0/${account.whatsapp_business_account_id}/message_templates?fields=name,language,status,category,components&limit=250`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const tplJson = await tplRes.json();
      if (!tplRes.ok) {
        return res
          .status(tplRes.status)
          .json({
            error:
              tplJson.error?.message ||
              "Failed to validate template before sending",
          });
      }

      const template = (tplJson.data || []).find(
        (tpl: any) =>
          tpl.name === template_name &&
          (!template_language || tpl.language === template_language),
      );
      if (!template) {
        return res.status(400).json({
          error: `Could not validate template "${template_name}" before sending. Refresh templates and try again.`,
        });
      }
      const header = template?.components?.find(
        (component: any) => component.type === "HEADER",
      );
      const headerFormat = String(header?.format || "").toLowerCase();
      const body = template?.components?.find(
        (component: any) => component.type === "BODY",
      );
      const footer = template?.components?.find(
        (component: any) => component.type === "FOOTER",
      );
      const templateButtons =
        template?.components?.find(
          (component: any) => component.type === "BUTTONS",
        )?.buttons || [];

      if (body?.text && !variableMapping._template_body)
        variableMapping._template_body = body.text;
      if (footer?.text) variableMapping._template_footer = footer.text;
      if (template?.category) {
        variableMapping._template_category = normalizeWhatsappBillingCategory(
          template.category,
          "marketing",
        );
      }
      variableMapping._template_buttons = templateButtons
        .map((button: any, index: number) => ({
          index,
          type: button?.type || "",
          text: button?.text || `Button ${index + 1}`,
          url: button?.url || "",
          phone_number: button?.phone_number || "",
        }))
        .filter((button: any) => button.text);

      if (["image", "video", "document"].includes(headerFormat)) {
        const { type: headerMediaType, url: headerMediaUrl } =
          normalizeTemplateHeaderMedia(variableMapping, headerFormat);
        if (headerMediaType !== headerFormat || !headerMediaUrl) {
          return res.status(400).json({
            error: `Template "${template_name}" requires a ${headerFormat} header media URL. Upload media or paste a public URL before launching.`,
          });
        }
        variableMapping._header_media_type = headerFormat;
        variableMapping._header_media_url = headerMediaUrl;
        variableMapping.header_media_type = headerFormat;
        variableMapping.header_media_url = headerMediaUrl;
      }

      const buttons = templateButtons;
      for (let index = 0; index < buttons.length; index++) {
        const button = buttons[index];
        const isDynamicUrlButton =
          String(button?.type || "").toUpperCase() === "URL" &&
          String(button?.url || "").includes("{{");
        if (!isDynamicUrlButton) continue;

        const rawButtonValue =
          variableMapping[`_button_url_${index}`] ||
          variableMapping[`button_url_${index}`];
        const buttonValidation = validateDynamicUrlButtonValue(
          button.url,
          rawButtonValue,
        );
        if (!buttonValidation.ok) {
          return res.status(400).json({
            error: `Template "${template_name}" has a dynamic URL button "${button.text || index + 1}". ${buttonValidation.error}`,
          });
        }

        const buttonValue = buttonValidation.value;
        variableMapping[`_button_url_${index}`] = buttonValue;
        variableMapping[`button_url_${index}`] = buttonValue;
      }
    }

    const billingCategory = normalizeWhatsappBillingCategory(
      variableMapping._template_category,
      "marketing",
    );
    const estimate = await buildBroadcastBillingEstimate({
      organization_id: orgId,
      audience_tag: audience_tag || null,
      audience_type: req.body.audience_type || null,
      csv_data: Array.isArray(csv_data) ? csv_data : null,
      template_category: billingCategory,
    });

    if (req.body.audience_type) {
      variableMapping._audience_type = req.body.audience_type;
    }

    if (estimate.audience_count <= 0) {
      return res
        .status(400)
        .json({
          error: "No recipients found for this broadcast audience.",
          estimate,
        });
    }
    if (!estimate.plan.allowed) {
      return res.status(402).json({
        error: `Your ${estimate.plan.name} plan has reached its monthly broadcast limit. Upgrade your plan to launch more campaigns.`,
        estimate,
      });
    }
    if (!estimate.enough_wallet) {
      return res.status(402).json({
        error: `Insufficient wallet balance. Estimated cost is ₹${(estimate.estimated_cost_paise / 100).toLocaleString("en-IN")} but wallet balance is ₹${(estimate.wallet_balance_paise / 100).toLocaleString("en-IN")}. Recharge your wallet before launching.`,
        estimate,
      });
    }

    const isScheduled = scheduled_at && new Date(scheduled_at) > new Date();
    console.log("[broadcast/send] saving variable_mapping", {
      template_name,
      required_header_type,
      header_media_type,
      has_header_media_url: !!header_media_url,
      variableMapping,
    });

    const { data: campaign, error: insertErr } = await supabase
      .from("w_campaigns")
      .insert({
        organization_id: orgId,
        wa_account_id,
        name: name || "Untitled Campaign",
        audience_tag: audience_tag || null,
        csv_data: csv_data || null,
        template_name,
        template_language,
        variable_mapping: variableMapping,
        scheduled_at: scheduled_at || null,
        status: isScheduled ? "scheduled" : "processing",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Campaign insert error:", insertErr);
      throw new Error(
        "Database Error: Have you run the w_campaigns SQL script in Supabase?",
      );
    }

    const { data: persistedCampaign, error: mappingPersistErr } = await supabase
      .from("w_campaigns")
      .update({ variable_mapping: variableMapping })
      .eq("id", campaign.id)
      .select()
      .single();

    if (mappingPersistErr) {
      console.error(
        "[broadcast/send] Failed to persist campaign variable_mapping after insert:",
        mappingPersistErr,
      );
    }

    await supabase
      .from("w_campaigns")
      .update({
        billing_category: billingCategory,
        estimated_cost_paise: estimate.estimated_cost_paise,
        billing_status:
          estimate.estimated_cost_paise > 0 ? "estimated" : "charged",
      })
      .eq("id", campaign.id);

    const campaignForProcessing = {
      ...(persistedCampaign || campaign),
      variable_mapping: variableMapping,
    };

    console.log("[broadcast/send] persisted variable_mapping", {
      campaign_id: campaignForProcessing.id,
      saved_header_media_url: !!normalizeTemplateHeaderMedia(
        campaignForProcessing.variable_mapping,
      ).url,
      variable_mapping: campaignForProcessing.variable_mapping,
    });

    if (!isScheduled) {
      // Process asynchronously without blocking response
      processCampaign(campaignForProcessing);
      res.json({
        message: "Campaign processing started",
        campaign: campaignForProcessing,
        status: "processing",
      });
    } else {
      res.json({
        message: "Campaign scheduled successfully",
        campaign: campaignForProcessing,
        status: "scheduled",
      });
    }
  } catch (err: any) {
    console.error("Broadcast Send Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/broadcast/campaigns
app.get("/api/broadcast/campaigns", authMiddleware, async (req, res) => {
  const orgId = (req as any).organization_id;
  try {
    const { data, error } = await supabase
      .from("w_campaigns")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ campaigns: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/broadcast/campaigns/:id
app.delete("/api/broadcast/campaigns/:id", authMiddleware, async (req, res) => {
  const orgId = (req as any).organization_id;
  try {
    const { error } = await supabase
      .from("w_campaigns")
      .delete()
      .eq("id", req.params.id)
      .eq("organization_id", orgId)
      .eq("status", "scheduled"); // Only allow deleting scheduled campaigns

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/broadcast/campaigns/:id/cancel
app.post(
  "/api/broadcast/campaigns/:id/cancel",
  authMiddleware,
  async (req, res) => {
    const orgId = (req as any).organization_id;
    try {
      const { data, error } = await supabase
        .from("w_campaigns")
        .update({ status: "cancelled" })
        .eq("id", req.params.id)
        .eq("organization_id", orgId)
        .in("status", ["processing", "scheduled"])
        .select()
        .single();

      if (error) throw error;
      if (!data)
        return res
          .status(404)
          .json({ error: "Campaign not found or cannot be cancelled" });
      res.json({ success: true, campaign: data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ====== Twilio Routes ======

// Use placeholders or empty if not present, to avoid crashing
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
let twilioClient: any = null;
if (TWILIO_SID && TWILIO_TOKEN) {
  twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
}

app.post(
  "/api/twilio/available-numbers",
  authMiddleware,
  async (req: any, res) => {
    try {
      if (!twilioClient) {
        return res
          .status(500)
          .json({ error: "Twilio API keys not configured on server." });
      }
      const { country = "US" } = req.body;
      // Search local numbers
      const numbers = await twilioClient
        .availablePhoneNumbers(country)
        .local.list({
          smsEnabled: true,
          voiceEnabled: true,
          limit: 10,
        });
      res.json({ numbers });
    } catch (err: any) {
      console.error("[TWILIO SEARCH]", err);
      res
        .status(500)
        .json({ error: err.message || "Failed to search Twilio numbers" });
    }
  },
);

app.post("/api/twilio/buy-number", authMiddleware, async (req: any, res) => {
  const orgId = req.organization_id;
  try {
    if (!twilioClient) {
      return res
        .status(500)
        .json({ error: "Twilio API keys not configured on server." });
    }
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ error: "Phone number is required" });

    // Check if user has space for a new number limit
    await enforcePlanResourceLimit({
      organization_id: orgId,
      resource: "numbers",
      table: "w_wa_accounts",
      label: "WhatsApp numbers",
    });

    // Buy the number
    const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName: `GAP FlowPilot - Org ${orgId}`,
    });

    // Save it to w_wa_accounts as a connected/setup number (or pending)
    const { data: acc, error: accErr } = await supabase
      .from("w_wa_accounts")
      .insert({
        organization_id: orgId,
        phone_number: purchasedNumber.phoneNumber,
        display_phone_number: purchasedNumber.phoneNumber,
        status: "PENDING_META_VERIFICATION", // Custom status telling the user to verify on Meta
        is_active: true,
      })
      .select()
      .single();

    if (accErr) throw accErr;

    res.json({ success: true, account: acc, twilio_number: purchasedNumber });
  } catch (err: any) {
    console.error("[TWILIO BUY]", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to buy Twilio number" });
  }
});

httpServer.listen(PORT, () => {
  console.log(`âœ… Server running on port ${PORT}`);
  // Check missing dirs
  if (!fs.existsSync("baileys_auth_info")) {
    fs.mkdirSync("baileys_auth_info");
  }
});
