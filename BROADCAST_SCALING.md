# Large-scale broadcast deployment

The production pipeline supports campaigns of up to 10,000 unique recipients.


## Rollout

1. Apply `supabase/migrations/20260629160000_large_scale_broadcast_queue.sql`.
2. Provision a managed Redis instance with persistence and TLS.
3. Configure the API and worker from `backend/.env.example`.
4. Deploy the API normally with `npm start`.
5. Deploy at least one independent worker with `npm run worker:broadcast`.
6. Confirm Redis, worker, and database health before setting `BROADCAST_QUEUE_ENABLED=true`.

API and workers must share the same Redis and Supabase project. The feature flag keeps
the legacy processor available during rollout. When enabled, the legacy campaign cron is
disabled and BullMQ owns immediate sends, delayed campaigns, retries, and reconciliation.

## Scaling and safety

- Scale broadcast workers horizontally; database claims and stable recipient job IDs prevent replay.
- Start with the default 10 requests/second per Meta phone number. Tune from observed throughput
  and throttling instead of raising it blindly.
- Run multiple campaigns for the same number through bounded 100-recipient windows. Different
  phone numbers process independently.
- Alert on Redis unavailability, queue backlog, repeated Meta authentication/template errors,
  high `429` rates, stale processing rows, and wallet reconciliation mismatch.
- `BROADCAST_GLOBAL_PAUSED=true` is the platform kill switch. The database columns
  `organizations.broadcasts_paused` and `w_wa_accounts.broadcasts_paused` provide tenant and
  phone-number kill switches.
- Keep the queue feature disabled if the migration or worker deployment is unavailable.

## Rollback

Set `BROADCAST_QUEUE_ENABLED=false` to stop creating queue-backed campaigns. Do not remove the
recipient table while version-2 campaigns exist. Allow active workers to drain or pause/cancel
campaigns before scaling workers to zero.
