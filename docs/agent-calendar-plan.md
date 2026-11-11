# Agent upcoming sessions

Per-agent, opt-in read-only access to one explicitly selected public sessions calendar. Reuse organization Google tokens, without modifying appointment operations or their primary calendar.

- Store calendar settings in existing __agent_settings metadata; no migration required.
- Authenticated agent calendar endpoints list accessible calendars and preview the next 14 days.
- Separate calendar reader validates date ranges, expands recurring events, paginates, excludes cancelled/private events and attendee data, and distinguishes errors from empty results.
- AI uses a date-range lookup tool for schedule questions and follow-ups. Current timestamp and selected timezone resolve relative weeks. Event text is untrusted data, never instructions. No booking or capacity claims.
- Existing agents remain disabled by default. Partial settings updates preserve knowledge and automation.
- Verify backend typecheck, frontend production build, and focused range/filter/pagination/failure tests. Live OAuth and conversational checks require a configured Google connection.

## Implemented behavior and rollout

Agent Configure → Upcoming sessions → Connect Google → select a dedicated calendar → Enable calendar answers → Save & Train. Preview shows the next 14 days. Existing agents opt out by default. Schedule lookup is live (no stale cache), maximum 62-day range; large results are marked truncated so the assistant can narrow its query. Existing Google scopes and workspace token storage are reused: this feature only reads, but the shared connection still has appointment write permissions. Reconnecting changes the account used by existing appointments; the UI explains this.

Server needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI, with the existing callback URL registered in Google OAuth. New agent connection URLs use authenticated tenant context and signed, expiring state. Legacy flow-builder Google connection routes remain unchanged for compatibility; their pre-existing authorization/state handling needs a separate hardening pass.

Validation: frontend production build passed; five focused calendar tests passed; new component ESLint checked. Backend typecheck reports pre-existing errors in flows.controller.ts and summary.service.ts, none in changed files. Isolated browser reached the local application but is logged out, so authenticated desktop/mobile drawer inspection and real Google/WhatsApp round-trip remain unverified.

Smoke checks after connecting: ask this week's schedule, next week's sessions, a specific session's fee, then change its timing in Google and ask again. Check an all-day event, cancellation, private event exclusion, and disconnected-calendar response. Confirm appointment creation/cancellation still use the existing primary calendar.

## 11 November 2026 incident diagnosis

The WhatsApp test reply was produced by the deployed backend, not the local backend. Meta app subscription inspection confirmed the WhatsApp callback is https://whatsapp.getaipilot.in/webhook. The new /api/agents/calendar/calendars endpoint returns 401 locally (route exists, authentication required) and 404 on production (feature is not deployed). Production was running for roughly 13 days while local had recently restarted. The test agent has enabled calendar metadata and is assigned to the conversation. The platform credential passed a read-only gpt-4o-mini model-access check.

Added aiCalendarReply.test.ts with five fully synthetic, offline integration cases: zero knowledge documents with tool round trip; calendar permission error; successful empty calendar; disabled calendar; missing platform key. These and the five reader/auth tests pass. This verifies application orchestration, not real model output quality.

Required next step: deploy the prepared backend changes and configure platform AI/Google credentials on the production host. Production GOOGLE_REDIRECT_URI must be https://whatsapp.getaipilot.in/api/integrations/google/callback. Preserve the existing TOKEN_ENCRYPTION_KEY so stored Google tokens remain readable. Do not repoint the shared Meta webhook to localhost. Hosting access/configuration is pending. The live diagnostic was initially blocked by automatic approval review. The user subsequently explicitly approved sending the test conversation and relevant events to OpenAI. The approved diagnostic completed successfully: OpenAI 200 with a correctly bounded Asia/Kolkata date-range tool call, Calendar 200, final OpenAI 200. The generated reply correctly identified AI Workshop on 11 November, 5–6 PM, and read trainer/fees/language from the event description. No WhatsApp message was sent. Production deployment remains pending server hostname, SSH username and local key path.
