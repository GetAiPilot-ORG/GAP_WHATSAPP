# Technical Debt, Risks & Known Concerns

## 1. Architectural & Technical Debt

### Legacy Extraction Scripts in Repository Root & Backend
- **Root & Backend Root Files**: Files such as `backend/append_flow.cjs`, `backend/clean_baileys.cjs`, `backend/clean_flow.cjs`, `backend/extract.cjs`, `backend/extract_baileys.cjs`, `backend/extract_bot_agents.cjs`, `backend/fix_flow.cjs`, `backend/funcs_new.txt`, `backend/funcs_old.txt`, `backend/old_gets.txt`, `backend/routes_new.txt`, `backend/routes_old.txt`, `frontend/check_table.js`, and `frontend/rewrite_whatsapp_page.cjs` are legacy one-off scripts from earlier refactoring waves.
- **Risk**: Creates clutter, risks accidental execution, and causes confusion regarding the authoritative source of truth.
- **Remediation**: Move or archive these helper scripts to a dedicated `scratch/` or `archive/` directory out of production code paths.

### Schema Dual-Namespace Transition (`legacy` vs `w_*`)
- **Historical Context**: The database initially utilized table names `contacts`, `conversations`, `messages`, `wa_accounts`, and `bot_flows`. To resolve schema conflicts, a cleaner `w_*` namespace was introduced (`w_contacts`, `w_conversations`, `w_messages`, `w_wa_accounts`, `w_flows`, `w_flow_versions`, `w_campaigns`).
- **Risk**: Some older controllers or foreign key references still retain fallback lookups or backward-compatibility fields (e.g. checking `w_bot_flows` vs `w_flows`).
- **Remediation**: Complete deprecation of legacy tables and standardize all services strictly on the `w_*` schema.

---

## 2. Operational & Scaling Risks

### Redis Dependency in BullMQ Broadcast Engine
- **Scenario**: When `BROADCAST_QUEUE_ENABLED=true`, campaign dispatch relies on BullMQ workers and an active Redis instance.
- **Risk**: If Redis disconnects or has insufficient memory, jobs stall in the `broadcast-prepare` or `broadcast-send` queues.
- **Mitigation**: The system includes a fallback to legacy cron when `BROADCAST_QUEUE_ENABLED=false`, a 15-minute stale-job sweeper in `broadcast.worker.ts`, and tenant/global kill switches (`BROADCAST_GLOBAL_PAUSED=true`, `organizations.broadcasts_paused`, `w_wa_accounts.broadcasts_paused`).

### Baileys WhatsApp Web Session Fragility
- **Scenario**: WhatsApp Web protocol connections via `@whiskeysockets/baileys` are subject to WhatsApp protocol updates, mobile phone network drops, and session key corruption (`Bad MAC`, `Connection Closed 428`).
- **Risk**: Corrupted session directories in `baileys_auth_info/` trigger automatic session deletion on fatal crash, requiring the business user to scan a new QR code.
- **Mitigation**: Recommend Meta Cloud API (WABA) for mission-critical enterprise workloads and retain Baileys primarily for personal/small-scale numbers.

### Meta Cloud API Rate Limits & Tier Restrictions
- **Scenario**: Meta enforces 24-hour unique recipient limits per phone number (Tier 1K -> Tier 10K -> Tier 100K -> Unlimited) and strict spam/quality scores.
- **Risk**: Sending broadcasts above the account tier triggers Meta HTTP `429` / rejection codes and risks number banning.
- **Mitigation**: Token bucket rate limiter throttles outbound sends to 10 req/s per phone number; `fetchWithMetaBackoff` handles retries with exponential backoff and jitter.

---

## 3. Financial & Concurrency Considerations

### Wallet Deduction & Message Spend Idempotency
- **Scenario**: Large broadcast campaigns deduct per-message paise costs from `whatsapp_wallets`.
- **Risk**: Race conditions during high-concurrency sends could lead to negative wallet balances if deductions are not atomic.
- **Mitigation**: Database migration `20260713000000_failed_message_refund.sql` introduces unique idempotency keys on `whatsapp_wallet_transactions` and automated refunds for failed messages.

---

## 4. Frontend & Deployment Synchronization

### Live Backend vs Workspace Drift
- **Issue**: As documented in `LIVE_READINESS_CHANGES.md`, live backend server deployments must be synchronized with the latest workspace commits.
- **Risk**: Outdated backend deployments result in HTTP `404` errors when the live frontend calls newly added routes (e.g. `/api/flow-template-stars` or `GET /api/contacts/:id/profile-photo`).
- **Action**: Always trigger a backend deployment/restart when routing changes are introduced.
