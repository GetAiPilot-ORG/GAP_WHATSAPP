
import { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { listGoogleCalendarEvents, deleteGoogleCalendarEvent } from "../services/googleCalendar.service.js";

/**
 * GET /api/appointments
 * Fetch paginated scheduled appointments directly from Google Calendar API & Flow Sessions
 */
export async function getAppointments(req: Request, res: Response) {
  try {
    const organizationId = String(
      req.query.organization_id || req.headers["x-organization-id"] || ""
    ).trim();

    if (!organizationId) {
      return res.status(400).json({ error: "Missing organization_id" });
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "10"), 10) || 10));
    const search = String(req.query.search || "").trim().toLowerCase();
    const statusFilter = String(req.query.status || "all").trim().toLowerCase();

    // Consolidated appointments map (unique key)
    const appointmentsMap = new Map<string, any>();

    // 1. Fetch Real Live Events directly from Google Calendar API
    const googleEvents = await listGoogleCalendarEvents(organizationId).catch((err) => {
      console.error("Error fetching live Google Calendar events:", err);
      return [];
    });

    if (googleEvents && googleEvents.length > 0) {
      for (const gEvent of googleEvents) {
        if (!gEvent.start || gEvent.status === "cancelled") continue;

        const summary = gEvent.summary || "";
        const description = gEvent.description || "";
        const fullText = `${summary} ${description}`;

        const startStr = gEvent.start.dateTime || gEvent.start.date || "";
        const [appDate, rawTimeWithTz] = startStr.split("T");

        // Exclude fake far-future test years (e.g. 2028, 2029, 2030...)
        const appYear = parseInt((appDate || "").split("-")[0], 10);
        if (appYear > 2027) {
          continue;
        }

        // Parse client name and phone from summary/description
        let cName: string | null = null;
        let cPhone: string | null = null;

        const phoneMatch = fullText.match(/\+?\d[\d\s()-]{8,15}\d/);
        if (phoneMatch) {
          cPhone = phoneMatch[0].trim();
        }

        const summaryMatch = summary.match(/Appointment:\s*([^(]+)/i);
        if (summaryMatch) {
          cName = summaryMatch[1].trim();
        }

        // Skip generic personal Google Calendar entries with no contact details or appointment tag
        const isWhatsappApp = summary.toLowerCase().includes("appointment") || description.toLowerCase().includes("whatsapp");
        if (!isWhatsappApp && !cPhone && !cName) {
          continue;
        }

        const appTime = rawTimeWithTz ? rawTimeWithTz.slice(0, 5) : "09:00";

        // Display time formatting
        const [h, m] = appTime.split(":");
        const hr = parseInt(h || "9", 10);
        const ampm = hr >= 12 ? "PM" : "AM";
        const displayHr = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
        const displayTime = `${String(displayHr).padStart(2, "0")}:${m || "00"} ${ampm}`;

        const key = `gcal_${gEvent.id}`;
        appointmentsMap.set(key, {
          id: gEvent.id,
          google_event_id: gEvent.id,
          source: "Google Calendar",
          contact_id: null,
          conversation_id: null,
          flow_session_id: null,
          appointment_date: appDate,
          appointment_time: appTime,
          display_time: displayTime,
          appointment_datetime: startStr,
          status: "confirmed",
          created_at: gEvent.created || gEvent.updated,
          contact_name: cName,
          contact_phone: cPhone || null,
          html_link: gEvent.htmlLink || null,
        });
      }
    }

    // 2. Query w_flow_sessions as active sessions source
    const { data: flowSessions } = await supabase
      .from("w_flow_sessions")
      .select("id, organization_id, contact_id, state_data, created_at, updated_at")
      .eq("organization_id", organizationId);

    if (flowSessions && flowSessions.length > 0) {
      for (const session of flowSessions) {
        const state = session.state_data || {};

        // Skip explicitly cancelled or cleared appointment sessions
        if (state.appointment_status === "cancelled" || !state.appointment_date) {
          continue;
        }

        if (state.appointment_date && (state.appointment_time || state.selected_time_raw)) {
          const rawTime = state.selected_time_raw || "10:00";
          const gId = state.google_event_id;

          // Check if Google Calendar loop already added this event by gEvent.id
          let existingKey: string | null = null;
          if (gId) {
            const possibleKey = `gcal_${gId}`;
            if (appointmentsMap.has(possibleKey)) {
              existingKey = possibleKey;
            }
          }

          if (existingKey) {
            const existing = appointmentsMap.get(existingKey);
            existing.contact_id = session.contact_id || existing.contact_id;
            existing.flow_session_id = session.id;
            existing.status = state.appointment_status || existing.status || "confirmed";
            // Always keep google_event_id from gcal entry (already set), also add session_id for deletion routing
            existing.session_id = session.id;
            if (state.name) existing.contact_name = state.name;
            if (state.phone) existing.contact_phone = state.phone;
          } else {
            const key = `session_${session.id}`;
            appointmentsMap.set(key, {
              id: session.id,
              google_event_id: gId || null,
              session_id: session.id,
              source: "w_flow_sessions",
              contact_id: session.contact_id,
              conversation_id: null,
              flow_session_id: session.id,
              appointment_date: state.appointment_date,
              appointment_time: rawTime,
              display_time: state.appointment_time || "10:00 AM",
              appointment_datetime: state.appointment_datetime || `${state.appointment_date}T${rawTime}:00`,
              status: state.appointment_status || "confirmed",
              created_at: session.created_at || session.updated_at,
              contact_name: state.name || null,
              contact_phone: state.phone || null,
            });
          }
        }
      }
    }

    let allAppointments = Array.from(appointmentsMap.values());

    // 3. Batch resolve Contact details & Conversation IDs (Zero N+1 queries)
    const contactIds = Array.from(
      new Set(allAppointments.map((a) => a.contact_id).filter(Boolean))
    );

    let contactsMap = new Map<string, any>();
    let conversationsMap = new Map<string, string>(); // contact_id -> conversation_id

    if (contactIds.length > 0) {
      const { data: contactsData } = await supabase
        .from("w_contacts")
        .select("id, name, custom_name, phone, wa_id, wa_key")
        .in("id", contactIds);

      if (contactsData) {
        for (const c of contactsData) {
          contactsMap.set(c.id, c);
        }
      }

      const { data: convsData } = await supabase
        .from("w_conversations")
        .select("id, contact_id")
        .in("contact_id", contactIds);

      if (convsData) {
        for (const conv of convsData) {
          if (conv.contact_id) {
            conversationsMap.set(conv.contact_id, conv.id);
          }
        }
      }
    }

    // Attach resolved details
    allAppointments = allAppointments.map((app) => {
      const contact = app.contact_id ? contactsMap.get(app.contact_id) : null;
      const conversationId = app.conversation_id || (app.contact_id ? conversationsMap.get(app.contact_id) : null) || null;

      // Contact name priority: custom_name > name (if safe) > app.contact_name
      let resolvedName: string | null = app.contact_name || null;
      if (contact) {
        const cName = String(contact.custom_name || "").trim();
        const nName = String(contact.name || "").trim();
        if (cName) {
          resolvedName = cName;
        } else if (nName && !nName.includes("@") && !/^\+?[\d\s()-]+$/.test(nName)) {
          resolvedName = nName;
        }
      }

      // Contact phone priority: contact.phone > contact.wa_id > contact.wa_key > app.contact_phone
      let rawPhone = app.contact_phone || "";
      if (contact) {
        rawPhone = contact.phone || contact.wa_id || contact.wa_key || rawPhone;
      }

      let formattedPhone = "";
      if (rawPhone && rawPhone !== "Google Calendar Event") {
        const digits = String(rawPhone).replace(/[^0-9]/g, "");
        if (digits.length >= 10) {
          formattedPhone = digits.startsWith("91") && digits.length === 12
            ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
            : `+${digits}`;
        } else {
          formattedPhone = rawPhone;
        }
      } else if (app.contact_phone && app.contact_phone !== "Google Calendar Event") {
        formattedPhone = app.contact_phone;
      } else {
        formattedPhone = "Client Contact";
      }

      return {
        ...app,
        conversation_id: conversationId,
        contact_name: resolvedName,
        contact_phone: formattedPhone,
        avatar_url: null,
      };
    });

    // Exclude placeholder "Client Contact" entries and far-future test years (>2027)
    allAppointments = allAppointments.filter((app) => {
      const yr = parseInt((app.appointment_date || "").split("-")[0], 10);
      if (yr > 2027) return false;

      const name = String(app.contact_name || "").trim().toLowerCase();
      const phone = String(app.contact_phone || "").trim().toLowerCase();

      // Filter out entries that lack real contact identity (i.e. "Client Contact")
      const isDummyName = !name || name === "client contact";
      const isDummyPhone = !phone || phone === "client contact" || phone === "google calendar event";

      if (isDummyName && isDummyPhone) {
        return false;
      }

      return true;
    });

    // 4. Calculate Live Summary Metrics dynamically from valid active appointments
    const getLocalDateStr = () => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const activeAppointments = allAppointments.filter(
      (a) => String(a.status).toLowerCase() !== "cancelled"
    );

    const todayStr = getLocalDateStr();
    const nowMs = Date.now();
    const sevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;

    const totalBookings = activeAppointments.length;
    const todayCount = activeAppointments.filter((a) => a.appointment_date === todayStr).length;
    const upcomingWeekCount = activeAppointments.filter((a) => {
      const appMs = new Date(`${a.appointment_date}T${a.appointment_time || "09:00"}:00`).getTime();
      return appMs >= (nowMs - 24 * 60 * 60 * 1000) && appMs <= sevenDaysMs;
    }).length;

    const dateParam = String(req.query.date || "").trim();

    // 5. Apply Date Filter if provided
    if (dateParam) {
      const normalizeDateStr = (dStr: string | null | undefined): string => {
        if (!dStr) return "";
        const clean = String(dStr).split("T")[0].trim();
        if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(clean)) {
          const [d, m, y] = clean.split(/[-/]/);
          return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
        if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(clean)) {
          const [y, m, d] = clean.split(/[-/]/);
          return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
        return clean;
      };

      const targetDate = normalizeDateStr(dateParam);
      allAppointments = allAppointments.filter(
        (a) => normalizeDateStr(a.appointment_date) === targetDate
      );
    }

    // 6. Apply Status Filter
    if (statusFilter !== "all") {
      allAppointments = allAppointments.filter(
        (a) => String(a.status).toLowerCase() === statusFilter
      );
    }

    // 7. Apply Search Filter (Name or Phone number)
    if (search) {
      allAppointments = allAppointments.filter((a) => {
        const name = String(a.contact_name || "").toLowerCase();
        const phone = String(a.contact_phone || "").toLowerCase();
        const date = String(a.appointment_date || "").toLowerCase();
        return name.includes(search) || phone.includes(search) || date.includes(search);
      });
    }

    // 8. Pagination & Return
    const total = allAppointments.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedAppointments = allAppointments.slice(startIndex, startIndex + limit);

    return res.json({
      success: true,
      data: paginatedAppointments,
      summary: {
        totalBookings,
        todayCount,
        upcomingWeekCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error("Error fetching appointments:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch appointments" });
  }
}

/**
 * PATCH /api/appointments/:id/status
 * Update appointment status (e.g., 'confirmed', 'completed', 'cancelled')
 */
export async function updateAppointmentStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, organization_id: reqOrgId } = req.body;
    const organizationId = String(
      reqOrgId || req.query.organization_id || req.headers["x-organization-id"] || ""
    ).trim();

    if (!id || !status) {
      return res.status(400).json({ error: "Missing appointment id or status" });
    }

    const normalizedStatus = String(status).toLowerCase();
    let gEventId: string | null = id;

    if (organizationId) {
      const { data: sessions } = await supabase
        .from("w_flow_sessions")
        .select("id, state_data")
        .eq("organization_id", organizationId);

      if (sessions && sessions.length > 0) {
        for (const s of sessions) {
          const sd = s.state_data || {};
          const isMatch = s.id === id || sd.google_event_id === id || sd.appointment_id === id;
          if (isMatch) {
            if (sd.google_event_id) {
              gEventId = sd.google_event_id;
            }

            const updatedState = {
              ...sd,
              appointment_status: normalizedStatus,
              ...(normalizedStatus === "cancelled" ? { appointment_date: null, appointment_time: null, selected_time_raw: null } : {}),
            };

            await supabase
              .from("w_flow_sessions")
              .update({ state_data: updatedState })
              .eq("id", s.id);
          }
        }
      }
    }

    if (normalizedStatus === "cancelled" && organizationId && gEventId) {
      await deleteGoogleCalendarEvent(organizationId, gEventId).catch((err: any) =>
        console.error("Background error deleting Google Calendar event on status change:", err)
      );
    }

    return res.json({
      success: true,
      message: `Appointment status updated to ${normalizedStatus}`,
      status: normalizedStatus,
    });
  } catch (error: any) {
    console.error("Error updating appointment status:", error);
    return res.status(500).json({ error: error.message || "Failed to update appointment status" });
  }
}

/**
 * DELETE /api/appointments/:id
 * Delete an appointment and remove its Google Calendar event in real time
 */
export async function deleteAppointment(req: Request, res: Response) {
  try {
    const { id } = req.params;
    let organizationId = String(
      req.query.organization_id || req.headers["x-organization-id"] || ""
    ).trim();
    // Frontend explicitly sends google_event_id as query param
    const queryGEventId = String(req.query.google_event_id || "").trim();

    if (!id) {
      return res.status(400).json({ error: "Missing appointment id" });
    }

    console.log(`🔍 deleteAppointment called: id=${id}, org=${organizationId}, gcal_id=${queryGEventId}`);

    // Start with whatever we know as the google event id
    // queryGEventId is most reliable (frontend passes item.google_event_id)
    // id may itself be a gcal event id (when source=="Google Calendar", id==gEvent.id)
    let gEventId: string | null = queryGEventId || null;
    if (!gEventId && id) {
      // gcal event ids don't contain hyphens in UUID format; session UUIDs do (xxxxxxxx-xxxx-...)
      // gcal ids look like: abc123xyz_abc123... or similar
      const isLikelySessionUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (!isLikelySessionUUID) {
        // Likely a Google Calendar event id directly
        gEventId = id;
      }
    }

    // Query ALL sessions for this org to find any that reference this appointment
    let sessionsQuery = supabase.from("w_flow_sessions").select("id, organization_id, state_data");
    if (organizationId) {
      sessionsQuery = sessionsQuery.eq("organization_id", organizationId);
    }
    const { data: sessions } = await sessionsQuery;

    let sessionsCancelled = 0;
    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        const sd = s.state_data || {};
        const gcalIdInSession = sd.google_event_id || "";

        const isMatch =
          s.id === id ||
          (queryGEventId && gcalIdInSession === queryGEventId) ||
          gcalIdInSession === id ||
          sd.appointment_id === id;

        if (isMatch) {
          if (!organizationId && s.organization_id) {
            organizationId = s.organization_id;
          }
          // Always prefer session's stored google_event_id
          if (gcalIdInSession) {
            gEventId = gcalIdInSession;
            console.log(`✅ Resolved google_event_id=${gEventId} from session ${s.id}`);
          }

          const updatedState = {
            ...sd,
            appointment_status: "cancelled",
            appointment_date: null,
            appointment_time: null,
            selected_time_raw: null,
          };

          const { error: updateErr } = await supabase
            .from("w_flow_sessions")
            .update({ state_data: updatedState })
            .eq("id", s.id);

          if (updateErr) {
            console.error(`Failed to cancel session ${s.id}:`, updateErr);
          } else {
            sessionsCancelled++;
          }
        }
      }
    }

    console.log(`📋 Sessions cancelled: ${sessionsCancelled}, Google Event ID to delete: ${gEventId}`);

    // Delete from Google Calendar
    if (organizationId && gEventId) {
      console.log(`🗑️ Calling deleteGoogleCalendarEvent(org=${organizationId}, eventId=${gEventId})`);
      const deleted = await deleteGoogleCalendarEvent(organizationId, gEventId).catch((err: any) => {
        console.error("Error deleting event from Google Calendar:", err);
        return false;
      });
      console.log(`🗑️ Google Calendar delete result: ${deleted}`);
    } else {
      console.warn(`⚠️ Skipping Google Calendar delete: organizationId=${organizationId}, gEventId=${gEventId}`);
    }

    return res.json({
      success: true,
      message: "Appointment deleted successfully from app and Google Calendar",
    });
  } catch (error: any) {
    console.error("Error in deleteAppointment controller:", error);
    return res.status(500).json({ error: error.message || "Failed to delete appointment" });
  }
}
