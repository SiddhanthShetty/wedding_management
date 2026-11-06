# Messaging Integration — Provider-Neutral Design (not implemented)

**Status:** design only. No provider is connected, no credentials exist, and nothing in the app sends messages. Live sending needs separate approval.

## Goals

Send invitations, reminders and updates through any email, SMS or WhatsApp provider. Never send a message twice, retry safely, and keep delivery claims honest: only a provider callback can mark a message *provider-confirmed*.

## Components

```
Planner action ──► communication_records (state=queued, manual=false, dedupe_key)
                        │  (same transaction) outbox row
                        ▼
                  Outbox worker (server-only, service credentials)
                        │  ProviderAdapter.send(message, idempotencyKey)
                        ▼
                  Provider ──► webhook /api/messaging/callback/<provider>
                                   │ verify signature + timestamp, map status
                                   ▼
                  communication_records state: sent → provider_confirmed | failed
```

### ProviderAdapter interface

```ts
interface ProviderAdapter {
  name: string;                                   // stored in provider_name
  channels: Array<"email" | "sms" | "whatsapp">;
  send(input: { to: string; subject?: string; body: string; idempotencyKey: string }):
    Promise<{ providerMessageId: string } | { retryable: boolean; error: string }>;
  verifyCallback(request: Request): Promise<boolean>;  // HMAC/signature + replay window
  parseCallback(body: unknown): Array<{ providerMessageId: string; status: "delivered" | "failed" | "bounced" | "complained"; at: string; reason?: string }>;
}
```

Adapters live server-side only. Credentials go in the hosting platform's secret store, never in `NEXT_PUBLIC_*` variables or the repository.

## State machine

| From | To | Trigger |
| --- | --- | --- |
| drafted | queued | planner confirms sending (non-manual record) |
| queued | sent | provider accepted the message (`provider_message_id` stored) |
| queued | failed | permanent error, or retries exhausted |
| sent | provider_confirmed | delivery callback |
| sent | failed | bounce or failure callback |
| failed | drafted | planner edits and chooses to retry |

“Sent” means *accepted by the provider*, not delivered. The UI copy must keep that distinction. The current schema and `guard_communication_state` already reserve these states and reject them for manual records.

## Deduplication

- `dedupe_key` (template version + function + guest) is unique per wedding, so a second queue request is a no-op.
- The worker passes `communication_records.id` as the provider idempotency key wherever the provider supports one.
- Queueing is done in one transaction with an outbox row. The worker claims rows with `FOR UPDATE SKIP LOCKED`, so two workers cannot both send.

## Retries

- Retry only errors the adapter marks retryable (timeouts, 429, 5xx). Use exponential backoff with jitter (for example 1 min, 5 min, 30 min, 2 h), with at most 5 attempts.
- Store `attempt_count`, `next_attempt_at` and `last_error` (redacted) on the outbox row.
- After the last attempt the record moves to `failed` with a reason a planner can read. A planner must act before anything is resent.
- Respect quiet hours and provider rate limits per wedding.

## Delivery-status callbacks

- One endpoint per provider: `POST /api/messaging/callback/<provider>`. Verify the signature, reject timestamps older than 5 minutes, and answer `2xx` quickly.
- Store raw callback events in an append-only table, keyed by `(provider, event_id)` so replays are ignored.
- Map events to state transitions using the table above. Ignore transitions the state guard rejects, such as an out-of-order delivered-after-failed, and log them.
- Unknown `provider_message_id` values are recorded and alerted on, never applied by guesswork.

## Privacy and safety

- Only send to contact details already on the guest record. Add an opt-out flag per guest and channel before going live.
- Logs keep record ids and provider ids, never message bodies, phone numbers or email addresses.
- Add a per-wedding sending switch (default off), a per-batch confirmation showing recipient count, and an owner-only permission to send.
- Test only against provider sandbox or test modes, with `.test` addresses.

## Migration needed when implemented

An outbox table (`message_outbox`), a callback event table, and an `opt_out` set per guest and channel. The existing `communication_records` columns (`manual`, `provider_name`, `provider_message_id`, `provider_status_at`, `failure_reason`, `dedupe_key`) are already in place.
