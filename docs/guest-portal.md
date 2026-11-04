# Private household invitation portal

## Access and data model

The portal uses `guest_households`, `guests`, `guest_invitations`, `guest_rsvps`, and `guest_rsvp_history`. It does not create another guest list. A household bearer link reveals only household members who have at least one active invitation and the functions attached to those invitation rows. Canceled or archived functions and withdrawn invitations are omitted. Internal notes, contact details, plus-one authorization, invitation editing, and other households are not sent to the portal.

The token is 256 bits of randomness and is placed in the URL fragment, which browsers do not send in HTTP requests or referrers. The page clears the fragment before exchanging it. Only a keyed HMAC digest is stored. The exchange issues a 12-hour `HttpOnly`, `Secure`, `SameSite=Lax` session cookie scoped to `/guest`; every read and write rechecks the session, link, expiry, revocation state, household, and current invitation. Links expire after 30 days by default. Replacing a link revokes its predecessor; revoking a link invalidates existing sessions on their next request.

Portal submissions are server-validated and use idempotency keys. The database rate limiter allows 30 token exchanges and 30 submissions per 15-minute bucket, and 120 portal reads per minute, per HMACed client address. Responses update the existing RSVP row and append to RSVP history with `response_source='portal'`. Dietary, allergy, and assistance edits are limited to the current person and append to profile edit history. Both planner and guest writes use optimistic timestamp checks; a stale submission returns a conflict and requires a refresh instead of overwriting the newer values.

Invalid, expired, and revoked links share the same response. Portal pages and endpoints are dynamic and `private, no-store`, set `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow, noarchive`, and make no analytics or third-party requests. Map links are explicit HTTPS links entered by planners and are never fetched by the server.

## Configuration

Set a server-only HMAC secret in `.env.local` and the deployment environment. Generate your own value; do not commit it or add a `NEXT_PUBLIC_` prefix:

```sh
openssl rand -hex 32
```

Copy the generated value to:

```dotenv
GUEST_PORTAL_HMAC_SECRET=<your-generated-value>
```

The same secret must remain stable while links and sessions are active. Rotating it invalidates all outstanding portal links and sessions; planners can then issue replacements. The application hashes trusted `x-real-ip` or `x-forwarded-for` values with this key before sending them to the database rate limiter. Configure the hosting proxy to overwrite these headers; if no address is provided, the shared `unknown` bucket is used.

## Database impact

Migration `20261104170000_private_guest_portal.sql` adds household link and short-lived session records, hashed rate-limit buckets, guest-profile edit history, and portal idempotency attribution on RSVP history. It adds an HTTPS-only `guest_map_url` to functions and changes planner guest/RSVP update RPCs to require the version read by the form. Existing household, guest, invitation, RSVP, and history records are retained. It does not create links, send messages, or modify existing RSVP answers.

The migration is local and versioned. Do not apply it to a remote Supabase project without separate approval. Local Supabase CLI commands require a running local database; the PGlite test harness executes the migration without Docker.

## Current limits

Stay, pickup, arrival/departure, and menu data are not persisted by the current logistics module. The portal therefore does not invent or display those details. Once those records are implemented, guest-visible fields should be added through a narrow, confirmed-only portal DTO. Link creation is manual in the authenticated Guests workspace; no invitations or messages are sent.
