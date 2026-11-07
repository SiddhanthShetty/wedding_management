# Release-Readiness Review

**Date:** 2026-11-06 · **Scope:** the whole app after the stays & transport, schedules, documents & messages, and dashboard milestones · **Environment:** local macOS checkout. No deployment, remote database change or production data was touched.

## Verdict: **NO-GO**

The code and database rules are well covered by automated tests, but the app has **never run end to end against a real Supabase database with the current migrations**. File storage has never touched real Supabase Storage. Backups have not been set up or restored. The blockers below must be cleared before real wedding data goes in.

## Prioritised blockers

| # | Blocker | Why it blocks | How to clear |
| --- | --- | --- | --- |
| 1 | **Partly cleared (2026-11-06):** all 14 migrations are applied to `wedding_management` (`reikygaktingpoworigo`, labelled production). A schema and data dump was taken first. RLS on every new table, the private `wedding-documents` bucket (8 MB, allowed types) and its 3 storage policies were verified. The app has **not** yet been exercised signed in against it. | Behaviour through PostgREST/Auth/Storage is still unverified. | Run the signed-in browser and upload checks against this project (blocker 2), or against a separate staging project. |
| 2 | No integration or browser tests ran **signed in**. There's no local Supabase (Docker missing), so Playwright only covers signed-out flows. | Mobile and keyboard use of every signed-in form, upload and download, signed URLs and RLS through PostgREST are unverified. | Run `npx supabase start` (needs Docker), `npm run db:reset`, then extend `tests/smoke.spec.ts` with signed-in journeys for the seeded `*.test` users. |
| 3 | **Backups and restore not configured or tested.** | Losing guest, RSVP or payment records is unrecoverable. | Enable Supabase PITR or daily backups on the production plan, then run the restore drill below in an isolated project. |
| 4 | **Storage bucket untested on real Supabase.** The bucket and object policies are created only when the `storage` schema exists. Tests use a minimal stand-in. | Uploads or downloads may fail, or be wrongly permitted, if the real storage schema differs. | On staging, upload, view, download and purge as owner, scoped member and other-wedding owner. Confirm the bucket is private and signed URLs expire after 60 s. |
| 5 | **No linter configured** (`eslint` is not a dependency, and Next 16 has no `next lint`). | Agreed checks include linting. | Approve adding `eslint` + `eslint-config-next` (dev-only), or explicitly waive. |
| 6 | **Trusted proxy headers.** Guest-portal rate limiting trusts `x-real-ip` / `x-forwarded-for`, and same-origin checks trust `x-forwarded-host`. | Behind a proxy that passes client-supplied values through, rate limits can be bypassed. | Deploy behind a platform that overwrites these headers (for example Vercel). Confirm with a staging request. |

Not blocking, but should be fixed soon:

- **No malware scanning** of uploads. This is documented, and the UI says “not malware-scanned”. Add a scanner before inviting many collaborators to upload.
- No Content-Security-Policy header yet.
- One wedding per account in the UI (`requireCurrentWorkspace` picks the oldest membership; no switcher).

## Checks actually run

Run on 2026-11-06 in this checkout, after all fixes below.

| Check | Command | Result |
| --- | --- | --- |
| Type checking | `npm run typecheck` | **Passed** (exit 0) |
| Linting | — | **Not run, not configured** (blocker 5) |
| Unit tests (business rules) | `npm run test:unit` | **Passed**: 8 files, 115 tests after the QA review (one run also covers the database rows below) |
| Database / access-policy tests | same run (PGlite with every migration and the synthetic seed; stand-in `storage` schema for document tests) | **Passed** |
| Integration tests against Supabase (PostgREST, Auth, Storage) | — | **Blocked**: no Docker/local Supabase; remote changes need approval |
| Browser tests (Playwright, Chromium) | `npm run test:smoke` | **Passed**: 4 tests. Signed-out flows only: redirects for every workspace route incl. new ones, mobile sign-in, guest portal headers, upload/download endpoint refusals |
| Production build | `npm run build` | **Passed**: 27 routes |
| Restore test | — | **Blocked**: no isolated database available |

### Defects found and fixed during this review

- **Same-origin check rejected genuine requests.** The guest-portal token exchange and the new upload route compared the browser `Origin` with Next's internal URL. That fails when the app is reached as `127.0.0.1` but runs as `localhost`, and behind most proxies. A guest opening a valid link could see “link not available”. Both now use `isSameOriginRequest`, which compares against the addressed host the way Next's Server Action check does. Covered by a unit test and a browser test.
- **Guest-only collaborators saw no functions** on the Guests page, because `functions` is readable only with planning access. The Guests and Messages pages now use `get_guest_function_references`, which checks guest-module access.
- **Leftover demo content.** The dead demo branches of `SectionPage` and `src/lib/demo-data.ts` are removed. The overview no longer shows synthetic figures, and only the dev-only design-system page shows sample content.
- **Upcoming payments were capped at 12** on the Budget page, so a dashboard count could disagree with the list. The cap is removed.
- New `private.*` helper functions now follow the foundation's privilege pattern (PUBLIC execute revoked).

## Scenario coverage

“Automated” means a test in `tests/` that ran green against an in-memory Postgres with all migrations and synthetic seed data. It does **not** mean verified through the deployed app.

| Scenario | Status | Evidence |
| --- | --- | --- |
| Both partners collaborate on one wedding | Automated | `release-scenarios`: partner edit, then stale save matches nothing; `security`: two owners |
| Another wedding's records inaccessible | Automated | `release-scenarios` (11 tables + 3 helper functions), `security`, per-module tests |
| Restricted collaborators cannot exceed permissions | Automated | `release-scenarios`, `security` (self-escalation), per-module RLS tests |
| Venue research → quote → booking → payment | Automated | `release-scenarios`: unknown quote line stays unknown; “booked” status alone creates no booking |
| Shared booking costs not double-counted | Automated | `dashboard`, `planning` allocation tests |
| Household members get different function invitations | Automated | `planning`: four-member household, two functions |
| Portal RSVPs update accurate headcounts | Automated | `planning`: portal batch RSVP, idempotency, stale rollback |
| Catering guarantees unchanged until approved | Automated | `planning`: approved guarantee and snapshot unchanged after late RSVP |
| Room and vehicle limits enforced | Automated | `travel`: occupancy, extra beds, held nights, seats, overlaps |
| Private documents not accessible across weddings | Automated (stand-in storage) | `documents-communications`; real Storage is blocker 4 |
| Revoked memberships and portal links lose access | Automated | `release-scenarios`, `security`, `planning` portal revocation and expiry |
| Concurrent edits don't silently erase changes | Automated | Version checks on tasks, issues, stays, journeys, schedule items, templates; RSVP/profile `updated_at` checks |
| CSV imports and exports preserve valid data | Automated | `release-scenarios` round-trip (commas, quotes, newlines, accents, formula cells), `planning` parser tests |
| Failed requests don't show false success | Automated (server actions) | `release-scenarios`: invalid input and unreachable database return an error with no message. `ActionForm` shows success only when there is no error. |
| Mobile forms and keyboard workflows | **Partially verified** | Signed-out sign-in on mobile (Playwright). Signed-in forms use labelled controls (`form-fields.tsx`), 44 px targets and native controls, but were **not exercised in a browser** (blocker 2). |

## Deployment configuration

- **Runtime:** Next.js 16 (Node runtime for `/api/*`). Build with `npm run build` and start with `npm start`, or deploy to a Next-aware platform.
- **Environment variables:**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public by design. RLS protects the data.
  - `GUEST_PORTAL_HMAC_SECRET`: server-only, at least 32 random characters. Changing it invalidates every portal link and session.
  - No service-role key is used by the app. Never add one to a `NEXT_PUBLIC_*` variable.
- **Supabase:** apply migrations in timestamp order with `supabase db push`. Confirm the `wedding-documents` bucket exists and is private. Set Auth site URL and redirect URLs to the deployed origin (`/auth/callback`).
- **Proxy/headers:** the platform must overwrite `x-forwarded-for` / `x-real-ip` and forward the public host, so `Origin` checks match.
- **Body size:** uploads are capped at 8 MB, under Next's 10 MB proxy buffering limit. Do not raise the cap without also raising `experimental.proxyClientMaxBodySize`, because larger bodies are silently truncated.

## Secret management

- Secrets live in the hosting platform's encrypted environment settings. `.env*` files are git-ignored except `.env.example`, which holds placeholders only.
- Rotate `GUEST_PORTAL_HMAC_SECRET` if exposed. Expect every portal link to stop working; reissue links from the Guests page.
- Supabase publishable key rotation: rotate in the dashboard, update the environment, redeploy.
- `.mcp.json` contains no credentials (a Perplexity MCP URL only).

## Logging and sensitive-data redaction

- App logs are limited to the error digest (`error.tsx`) and dashboard section failures, which log the module name and error class only. No request bodies, guest details, tokens or file contents are logged.
- Guest portal tokens are never stored or logged. Only HMAC digests are kept, and rate-limit keys are HMAC digests of addresses.
- Responses for portal, documents and exports are `no-store`. Portal and document responses are `no-referrer`.
- Platform request logs may record URLs. No URL in the app carries personal data or tokens: portal tokens travel in the URL fragment and signed document URLs live on the storage origin. Confirm the platform does not log the `Referer` header.

## Backup and restore procedure

1. **Backups:** on the production Supabase project, enable daily backups (Pro plan and above) and preferably point-in-time recovery. Storage objects are **not** included in database backups; schedule a separate copy of the `wedding-documents` bucket (for example `supabase storage cp` or S3-compatible sync) to private, encrypted storage.
2. **Logical export before risky changes:** `supabase db dump --data-only -f backup-<date>.sql` (requires approval and access to the project). Store it encrypted; it contains personal data.
3. **Restore drill (isolated environment):** create a separate Supabase project, apply migrations, restore the dump (`psql "$STAGING_DB_URL" -f backup-<date>.sql`), copy the bucket, point a local app at it, and check: sign-in, counts per table, one document download, one portal link. Record the date, size and duration.
4. **Status:** not performed. There is no isolated environment available here (blocker 3).

## Data export and deletion

- **Export today:** guest CSV (Guests page), dashboard CSV, message drafts CSV, hotel and driver summaries and operational pack (print to PDF). A full-wedding export does not exist yet; use the logical dump above.
- **Deletion today:** records are cancelled, archived or resolved rather than deleted. Document files can be permanently purged by owners, with metadata kept. Membership revocation removes access immediately.
- **Not yet available:** self-service deletion of a whole wedding, or erasure of one guest's personal data on request. Until built, handle requests manually with an owner: export, then delete or anonymise via SQL in a reviewed change. Document each request.

## Rollback procedure

- **App:** redeploy the previous build (platform “promote previous deployment”). All migrations are additive, so the old app keeps working with the new schema, except the portal function, which still returns its earlier fields plus two optional ones.
- **Database:** prefer a forward fix. If a new module must be removed, use a reviewed migration that drops its tables **after exporting them**. Reverse order: documents/communications → schedules/arrangements → accommodation/transport. Restore the previous `get_guest_portal_data` from `20261104170000_private_guest_portal.sql`. This deletes that module's data. Never run it without a fresh backup and approval.
- **Storage:** removing the bucket deletes files; copy them out first.

## Known limitations

See each module's doc: [stays & transport](./accommodation-transport.md), [schedules & arrangements](./schedules-arrangements.md), [documents & messages](./documents-communications.md), [dashboard](./dashboard.md). Also:

- No live messaging, payments or calendar sync, by design.
- No offline mode.
- Single wedding per account in the UI.
- Help centre link is a disabled placeholder.

## QA / security review (follow-up)

An independent review of this milestone found and fixed the issues below. The database fixes are in `supabase/migrations/20261106130000_qa_hardening.sql`, and every fix has a regression test in `tests/qa-regressions.test.ts`.

| ID | Severity | Issue | Fix |
| --- | --- | --- | --- |
| H1 | High | A manual message record could be updated into a “provider-confirmed” delivery, and its guest, recorder or dedupe key rewritten | Column-level update grants; trigger freezes identity and provider fields |
| H2 | High | Creator, approver and “entered by” columns accepted another member's id, so a design approval could be forged | Database stamps the signed-in member; creator columns are fixed on update; changing a design link clears its approval |
| M1 | Medium | Reminder exclusions (already responded, already sent) were only applied in the browser | Server re-runs recipient selection and reports dropped guests |
| M2 | Medium | Repeated submissions created duplicate journeys, schedule items, issues, arrangements and properties | `submission_key` with a unique index; forms send one key per attempt; a duplicate counts as already saved |
| M3 | Medium | Un-cancelling a journey could double-book a passenger | Journey validation re-checks passengers when leaving `cancelled` |
| M4 | Medium | Some dashboard counts linked to lists showing different records | Shared `matchesTaskView`; new `mine-open`/`mine-overdue` task views; Budget `?due=30`; expiring count is per vendor |
| M5 | Medium | Tab bars lacked arrow-key navigation and roving focus | Shared `TabList` component |
| L1 | Low | Departure before arrival gave a generic error | Field-level validation message |
| L2 | Low | A test title overstated what it checked | Renamed; the portal arrangement check lives in `travel.test.ts` |
| L3 | Low | Passengers could be removed from completed journeys | Delete guard, and no Remove button on completed journeys |
| L4 | Low | The operational pack said “No functions” for an unknown function link | Says “Function not found” |

Accepted, not changed: vendor contact phone is visible to logistics readers (needed for vendor arrivals); room-hold edits are last-write-wins; uploading the same file twice creates two versions.

Test harness note: it now grants `usage on schema auth` to the API roles, matching Supabase, so triggers that call `auth.uid()` run under the caller's privileges.

Still unverified: keyboard tab behaviour and signed-in mobile forms in a real browser (blocker 2).

## Usability release (follow-up)

- Migration `20261107100000_invitations.sql` was **applied** to `wedding_management` on 2026-11-06, after a dry run and a schema and data dump. Verified on the live project: migration history matches; `invitation_designs` has RLS and its 3 policies; `guest_households.preferred_language` exists; `set_default_invitation_design` and `set_household_language` exist; the guest-portal function includes the design and is executable only by `anon` (and the service role), not by signed-in members.
- The Overview now streams each section independently. Section loaders are cached per request (`React.cache`), so the “needs you today” list does not repeat queries.
- Remembered views use browser storage for convenience only; the app works without it.

## Invitation website and look-and-feel release (2026-11)

- **Three new migrations, applied to `wedding_management` on 2026-11-07** after a schema and data dump and a dry run. Checked on the live project afterwards: migration history matches; `guest_blessings` has RLS on and both of its policies; the new columns exist; the guest-only functions can be run by `anon` only (plus the service role), and `list_guest_portal_links` by signed-in members only.
  - `20261112100000_invitation_site.sql` adds `invitation_designs.site`, the `guest_blessings` table (with RLS and moderation), `submit_guest_portal_blessing`, and website data in the guest portal.
  - `20261113100000_invitation_photo.sql` adds `photo_data` and `show_monogram`, and `get_guest_portal_photo`.
  - `20261114100000_portal_link_activity.sql` adds `last_opened_at` to `list_guest_portal_links`.
- **Data impact:** these migrations only add columns, a table and functions. Existing rows get the defaults (an empty site, no photo, monogram on), and no data is removed. Apply them before deploying the matching code: the invitations page reads the new columns.
- **New dependency:** `qrcode-generator` 1.4.4 (MIT, no dependencies), used for the QR code on the print card.
- **Look and feel:**
  - The workspace takes the invitation theme's accent colour and the couple's monogram.
  - The Overview header shows the couple's names, the days to go, and the next function.
  - Money in INR shows as ₹ with Indian grouping.
  - Empty states show a kolam drawing.
  - A petal shower follows a "Yes" reply (none for reduced motion).
  - Phones get a bottom tab bar.
  - The print layout is tidier.
  - Accent text meets 4.5:1 contrast in every theme (tested).
- **Checks run:** `tsc --noEmit` passed. `vitest run` passed 162 tests in 12 files. `next build` passed. The Playwright smoke tests passed 4 tests.

## Invitation studio, Milestone 1 (2026-11)

- **New migration, applied to `wedding_management` on 2026-11-07** after a schema and data dump and a dry run: `20261115100000_invitation_preview_links.sql` adds the `invitation_preview_links` table (RLS on, no API access), `create_invitation_preview_link` (signed-in guest-list editors only) and `get_invitation_preview` (`anon` only).
- **Data impact:** additive. Nothing existing changes. Expired preview rows for a wedding are deleted whenever a new preview link is created for it.
- **Checked on the live project afterwards:** migration history matches. The table has RLS on, no policies, and no grants to `anon` or `authenticated`. `create_invitation_preview_link` can be run by `authenticated` only, and `get_invitation_preview` by `anon` only (plus the service role in both cases).
- **Checks run:** `tsc --noEmit` passed. `vitest run` passed 174 tests in 13 files. `next build` passed. The Playwright smoke tests passed 4 tests. The studio was also checked visually through a temporary demo page with fake data (since deleted), at desktop and phone widths.
- **Not run:** a signed-in check against the real database, and a family preview link created and opened end to end.

## Invitation studio, Milestone 2 (2026-11)

- **New migration, applied to `wedding_management` on 2026-11-07** after a schema and data dump and a dry run: `20261116100000_invitation_media.sql`. It adds:
  - the `invitation_media` table (RLS: guest-list readers can read, editors can add, caption, reorder and remove);
  - limits in the database: one music file per design up to 1.5 MB, up to 8 photos up to ~450 KB each, allowed types only;
  - read functions for guests (`list_guest_portal_media`, `get_guest_portal_media`) and family previews (`list_invitation_preview_media`, `get_invitation_preview_media`), callable by `anon` only.
- **Data impact:** additive. Nothing existing changes. Deleting a design deletes its media.
- **Checked on the live project afterwards:** migration history matches; `invitation_media` has RLS on and its 4 policies. `authenticated` can select, insert and delete, and update only `caption` and `position`. The 4 read functions can be run by `anon` only (plus the service role). The private helper functions have no API grants.
- **Checks run:** `tsc --noEmit` passed. `vitest run` passed 182 tests in 14 files. `next build` passed. The Playwright smoke tests passed 5 tests, including a new one: media addresses refuse anonymous, cross-site and session-less requests. The templates, openings, effects and gallery were also checked visually on a temporary demo page with fake data (since deleted).
- **Not run:** a real music or photo upload against the database, and music playback (the demo had no audio file).
