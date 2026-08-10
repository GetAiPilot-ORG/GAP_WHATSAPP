import { supabase } from "../config/supabase.js";
import { encryptToken, decryptToken } from "../utils/crypto.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "https://wb.getaipilot.in/api/integrations/google/callback";

export interface GoogleBusySlot {
  start: string;
  end: string;
}

/**
 * Generate Google OAuth consent URL for popup authentication.
 */
export function getGoogleOAuthUrl(state?: string, customRedirectUri?: string): string {
  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const redirectUri = customRedirectUri || GOOGLE_REDIRECT_URI;
  const options = {
    redirect_uri: redirectUri,
    client_id: GOOGLE_CLIENT_ID,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" "),
    state: state || "",
  };

  const qs = new URLSearchParams(options).toString();
  return `${rootUrl}?${qs}`;
}

/**
 * Exchange Authorization Code for Access & Refresh tokens, encrypt them, and store in DB.
 */
export async function handleGoogleOAuthCallback(code: string, organizationId: string, customRedirectUri?: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in server environment.");
  }

  const redirectUri = customRedirectUri || GOOGLE_REDIRECT_URI;

  // 1. Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to exchange Google OAuth code: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 3600;

  // 2. Fetch User Email for display
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = userRes.ok ? await userRes.json() : {};
  const connectedEmail = userData.email || "Google Account";

  // 3. Encrypt both tokens before storing
  const accessTokenEncrypted = encryptToken(accessToken);
  const refreshTokenEncrypted = refreshToken ? encryptToken(refreshToken) : null;
  const tokenExpiry = new Date(Date.now() + (expiresIn - 120) * 1000).toISOString();

  // 4. Upsert connection record in Supabase
  const { error: upsertErr } = await supabase.from("w_integrations").upsert(
    {
      organization_id: organizationId,
      provider: "google_calendar",
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expiry: tokenExpiry,
      connected_email: connectedEmail,
      metadata: { last_updated: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider" }
  );

  if (upsertErr) {
    console.error("Error saving Google tokens to DB:", upsertErr);
    throw new Error(`Failed to save integration details: ${upsertErr.message}`);
  }

  return { connectedEmail };
}

/**
 * Refresh access token using stored encrypted refresh token.
 */
export async function getValidAccessToken(organizationId: string): Promise<string | null> {
  const { data: record } = await supabase
    .from("w_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (!record || !record.refresh_token_encrypted) {
    return null;
  }

  // Check if current access token is still valid
  if (record.access_token_encrypted && record.token_expiry && new Date(record.token_expiry) > new Date()) {
    try {
      return decryptToken(record.access_token_encrypted);
    } catch (e) {
      console.warn("Failed to decrypt access token, refreshing...", e);
    }
  }

  // Otherwise, refresh access token using refresh_token
  const refreshToken = decryptToken(record.refresh_token_encrypted);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Failed to refresh Google access token:", await res.text());
    return null;
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;

  // Update encrypted access token in DB
  const newEncryptedAccess = encryptToken(newAccessToken);
  const newExpiry = new Date(Date.now() + (expiresIn - 120) * 1000).toISOString();

  await supabase
    .from("w_integrations")
    .update({
      access_token_encrypted: newEncryptedAccess,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id);

  return newAccessToken;
}

/**
 * Fetch occupied time slots from Google FreeBusy API.
 */
export async function getGoogleFreeBusy(
  organizationId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<GoogleBusySlot[]> {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken) return [];

    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        items: [{ id: "primary" }],
      }),
    });

    if (!res.ok) {
      console.error("Google FreeBusy API Error:", await res.text());
      return [];
    }

    const data = await res.json();
    const busyList = data.calendars?.primary?.busy || [];

    return busyList.map((item: any) => ({
      start: item.start,
      end: item.end,
    }));
  } catch (error) {
    console.error("Error in getGoogleFreeBusy:", error);
    return [];
  }
}

export async function fetchGoogleBusySlots(
  organizationId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<GoogleBusySlot[]> {
  return getGoogleFreeBusy(organizationId, timeMinIso, timeMaxIso);
}

/**
 * Fetch Primary Calendar TimeZone for Google Calendar user.
 */
export async function getGooglePrimaryTimeZone(organizationId: string): Promise<string> {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken) return "Asia/Kolkata";

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.timeZone) {
        return data.timeZone;
      }
    }
  } catch (err) {
    console.error("Error fetching Google Calendar timezone:", err);
  }
  return "Asia/Kolkata";
}

/**
 * Format local ISO string with exact timezone offset for Google Calendar API.
 * Prevents UTC offset shift (e.g. 11:00 AM shifting to 4:30 PM).
 */
export function formatIsoWithTimezone(localIsoStr: string, timeZoneStr: string): string {
  try {
    const rawIso = localIsoStr.split("+")[0].split("Z")[0];
    const parts = rawIso.split("T");
    const datePart = parts[0];
    const timePart = parts[1] || "09:00:00";
    if (!datePart) return localIsoStr;

    const [h, m] = timePart.split(":");
    const cleanTime = `${String(h || "09").padStart(2, "0")}:${String(m || "00").padStart(2, "0")}:00`;

    let targetTz = timeZoneStr || "Asia/Kolkata";
    // If the calendar timezone is UTC/GMT/Z, default to India Standard Time (Asia/Kolkata)
    if (
      targetTz.toUpperCase() === "UTC" ||
      targetTz.toUpperCase() === "GMT" ||
      targetTz === "Z"
    ) {
      targetTz = "Asia/Kolkata";
    }

    // Construct a reference date at noon on the selected date to measure timezone offset
    const refDate = new Date(`${datePart}T12:00:00Z`);

    // Robust parsing using Intl.DateTimeFormat parts (never relies on new Date(toLocaleString) parsing)
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: targetTz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });

    const fmtParts = formatter.formatToParts(refDate);
    const partMap: Record<string, string> = {};
    for (const p of fmtParts) {
      partMap[p.type] = p.value;
    }

    const year = parseInt(partMap.year, 10);
    const month = parseInt(partMap.month, 10) - 1;
    const day = parseInt(partMap.day, 10);
    const hour = parseInt(partMap.hour, 10);
    const minute = parseInt(partMap.minute, 10);
    const second = parseInt(partMap.second || "0", 10);

    const tzUtcTime = Date.UTC(year, month, day, hour, minute, second);
    const diffMinutes = Math.round((tzUtcTime - refDate.getTime()) / 60000);

    const sign = diffMinutes >= 0 ? "+" : "-";
    const absMinutes = Math.abs(diffMinutes);
    const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
    const offsetMins = String(absMinutes % 60).padStart(2, "0");
    const offsetStr = `${sign}${offsetHours}:${offsetMins}`;

    return `${datePart}T${cleanTime}${offsetStr}`;
  } catch (err) {
    console.error("Error formatting ISO with timezone offset:", err);
    return `${localIsoStr.split("+")[0].split("Z")[0]}+05:30`;
  }
}

/**
 * Create a new event on user's Primary Google Calendar.
 */
export async function createGoogleCalendarEvent(
  organizationId: string,
  summaryOrOptions: string | { summary: string; description?: string; startDateTimeISO: string; endDateTimeISO: string; timeZone?: string },
  startIso?: string,
  endIso?: string,
  description?: string
): Promise<{ success: boolean; eventId?: string }> {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken) return { success: false };

    let summary = "";
    let finalStart = "";
    let finalEnd = "";
    let finalDesc = "";
    let timeZone = "";

    if (typeof summaryOrOptions === "object") {
      summary = summaryOrOptions.summary;
      finalStart = summaryOrOptions.startDateTimeISO;
      finalEnd = summaryOrOptions.endDateTimeISO;
      finalDesc = summaryOrOptions.description || "Booked via WhatsApp Automation Flow";
      timeZone = summaryOrOptions.timeZone || "";
    } else {
      summary = summaryOrOptions;
      finalStart = startIso || "";
      finalEnd = endIso || "";
      finalDesc = description || "Booked via WhatsApp Automation Flow";
    }

    if (!timeZone) {
      timeZone = await getGooglePrimaryTimeZone(organizationId);
    }

    const formattedStart = formatIsoWithTimezone(finalStart, timeZone);
    const formattedEnd = formatIsoWithTimezone(finalEnd, timeZone);

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary,
          description: finalDesc,
          start: { dateTime: formattedStart, timeZone },
          end: { dateTime: formattedEnd, timeZone },
        }),
      }
    );

    if (!res.ok) {
      console.error("Failed to create Google Calendar Event:", await res.text());
      return { success: false };
    }

    const data = await res.json().catch(() => ({}));
    return {
      success: true,
      eventId: data?.id || undefined,
    };
  } catch (error) {
    console.error("Error in createGoogleCalendarEvent:", error);
    return { success: false };
  }
}

/**
 * Delete an event from Google Calendar by Event ID.
 */
export async function deleteGoogleCalendarEvent(
  organizationId: string,
  eventId: string
): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken || !eventId) return false;

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        console.log(`ℹ️ Google Calendar event ${eventId} already deleted or not found (status ${res.status})`);
        return true;
      }
      console.error("Failed to delete Google Calendar Event:", await res.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in deleteGoogleCalendarEvent:", error);
    return false;
  }
}

/**
 * List real Google Calendar events directly from Google's API in real time.
 */
export async function listGoogleCalendarEvents(
  organizationId: string,
  timeMinIso?: string
): Promise<any[]> {
  try {
    const accessToken = await getValidAccessToken(organizationId);
    if (!accessToken) return [];

    const nowIso = timeMinIso || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.append("timeMin", nowIso);
    url.searchParams.append("orderBy", "startTime");
    url.searchParams.append("singleEvents", "true");
    url.searchParams.append("maxResults", "200");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.error("Failed to list Google Calendar events:", await res.text());
      return [];
    }

    const data = await res.json();
    return data.items || [];
  } catch (error) {
    console.error("Error in listGoogleCalendarEvents:", error);
    return [];
  }
}
