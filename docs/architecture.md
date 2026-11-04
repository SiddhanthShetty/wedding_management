# Wedding Planning App — Architecture Proposal

**Status:** Foundation approved and implemented in part; see [Authentication and Data Foundation](./auth-data-foundation.md).  
**Repository assessment:** Only `AGENTS.md` exists. No working stack, schema, data, or tests need to be retained.

## 1. Proposed stack and system shape

- **Web:** Next.js App Router, TypeScript, Tailwind CSS. Use server components for data-backed pages and server actions or route handlers for validated mutations. Keep client components for interactive controls only.
- **Identity and data:** Supabase Auth and PostgreSQL. Use the Supabase SSR integration with secure, HTTP-only session cookies. Use database migrations committed to the repository and run locally through the Supabase CLI.
- **Authorization:** Every wedding-owned row carries a `wedding_id`. Enforce access in server-side application code and PostgreSQL Row Level Security (RLS). RLS policies derive access from database membership records, never from a client-supplied role or unverified metadata claim.
- **Files:** Supabase private Storage. Store metadata in PostgreSQL; store opaque object keys under a wedding-scoped path. Authorize reads/writes and issue short-lived signed URLs only after checking the user's membership or guest access.
- **Validation:** Shared TypeScript schemas (proposed: Zod) at form/action/API boundaries. Database constraints remain authoritative for uniqueness and referential integrity.
- **Tests:** Vitest and Testing Library for business rules and UI behavior; Supabase local integration tests for constraints and RLS; Playwright for browser flows and role-based access.
- **Secrets:** Supabase service-role credentials remain server-only and should not be needed for routine user requests. Never use a service-role client in browser code or log secrets/session tokens.

All application writes should pass through a server boundary that validates input, checks authorization, performs the operation, and returns a typed result. Database RLS remains a second boundary if an application check is missed. Sensitive actions should create an audit entry. Avoid destructive deletes for operational records; use archive/cancel/void states where history matters.

## 2. Route map

Route groups below are organizational; bracketed segments are dynamic route parameters.

### Couple/family workspace

| Route | Purpose |
| --- | --- |
| `/w/[weddingId]` | Workspace overview: upcoming tasks, function status, guest response summary, and budget rollups. |
| `/w/[weddingId]/functions` | Function list and creation. |
| `/w/[weddingId]/functions/[functionId]` | Function details, tasks, guest counts, and linked records. |
| `/w/[weddingId]/tasks` | Cross-function task board/list. |
| `/w/[weddingId]/decisions` | Decisions and their status/history. |
| `/w/[weddingId]/suppliers` | Supplier shortlist and supplier detail. |
| `/w/[weddingId]/suppliers/[vendorId]` | Quotes, booking links, documents, and notes for a supplier. |
| `/w/[weddingId]/bookings` | Booking list and tentative/confirmed status. |
| `/w/[weddingId]/budget` | Budget categories, costs, payments, and distinct estimated/committed/paid totals. |
| `/w/[weddingId]/guests` | Household and person directory. |
| `/w/[weddingId]/guests/[personId]` | Individual profile and per-function invitation/response state. |
| `/w/[weddingId]/invitations` | Invitation status and outstanding responses by function. |
| `/w/[weddingId]/planning/menus` | Menus and restricted dietary information (planning expansion). |
| `/w/[weddingId]/planning/stays` | Accommodation rooms and guest stays (planning expansion). |
| `/w/[weddingId]/planning/transport` | Transport options and allocations (planning expansion). |
| `/w/[weddingId]/schedule` | Function schedules/run sheets (wedding-day operations). |
| `/w/[weddingId]/documents` | Private document library. |
| `/w/[weddingId]/reports` | Operational summaries and exports. |
| `/w/[weddingId]/settings/members` | Invitations, membership roles, and scopes. |
| `/w/[weddingId]/settings` | Wedding-level settings and archive controls. |

### Private guest portal

| Route | Purpose |
| --- | --- |
| `/guest` | Household-scoped private invitation page, entered by exchanging a token from the URL fragment for a short-lived HttpOnly session cookie. |
| `/api/guest-portal/exchange` | Same-origin, rate-limited token exchange. The token is cleared from browser history before exchange and never appears in an HTTP request URL. |
| `/guest` (RSVP/profile actions) | Each invited household member responds separately to each active function and may edit only their meal preference, allergies, and assistance needs. |

Guest routes must not reveal uninvited people, other households, internal planning notes, costs, or private documents. A visitor is not a wedding member. Portal payloads contain only people with at least one active invitation and only that person's non-canceled, non-archived function invitations. Stay and transport fields remain absent until logistics data is persisted and explicitly approved for guests.

### Authentication and account settings

| Route | Purpose |
| --- | --- |
| `/sign-in` | Start authentication for workspace members and invited guests. |
| `/auth/callback` | Server-side auth callback and safe redirect handling. |
| `/auth/verify` | Verification / magic-link completion state. |
| `/account` | Account profile and active sessions/preferences. |
| `/account/security` | Authentication and session settings supported by the selected Supabase Auth configuration. |

Exact guest onboarding method (email magic link, another verified method, or both) is an approval decision. No private RSVP view should be accessible solely by an unverified URL token.

## 3. Conceptual data model

Use UUID primary keys. Wedding-owned tables include `wedding_id`, timestamps, and appropriate creator/updater references. Add composite unique keys and foreign keys such as `(wedding_id, id)` so relationships cannot accidentally cross weddings. Add indexes for wedding-scoped list/filter access. Enumerated statuses should be database constraints or lookup tables, not arbitrary text.

### Identity, tenancy, and functions

- **`weddings`** — display name, couple/host labels, timezone, reporting currency, settings, created-by, archived-at. The wedding is the tenant/security boundary.
- **`wedding_members`** — `wedding_id`, `user_id`, role (`owner`, `co_owner`, `scoped_collaborator`, `read_only_collaborator`), membership status, inviter, timestamps. Unique `(wedding_id, user_id)`.
- **`member_scopes`** — membership plus allowed domains (`planning`, `suppliers_finance`, `guests`, `logistics`). Read-only is a role, not a writable scope. Avoid row-level custom permissions until a demonstrated need.
- **`functions`** — wedding, name, description, start/end timestamps, venue fields, status (`tentative`, `confirmed`, `cancelled`), guest-facing visibility, timestamps.
- **`tasks`** — wedding, optional function, title/details, owner/member assignee, due date, status, priority, source/related record references, completed-at.
- **`decisions`** — wedding, optional function, title/options or outcome, status (`open`, `decided`, `deferred`), decision owner, decided-at, notes/history.

### Suppliers and finance

- **`suppliers`** — one wedding-scoped directory for venues and vendors, with category, contact and links, source, notes, responsible member, and research/shortlist status. Vendor accounts are out of scope.
- **Venue details** — optional one-to-one catering, outside-vendor, parking, access, policy, room availability, and weather-backup facts; event spaces have independent nullable capacities. Date availability is stored as append-only observations with check date and optional hold expiry.
- **`supplier_quotes` / line items** — immutable dated quote versions with currency, optional stated total, line-item kind (`service`, `tax`, `additional`), nullable amounts, inclusions/exclusions, and expiry. Blank amounts remain unknown; a quote is not itself a booking or paid cost. Supporting document references wait for private document storage.
- **Supplier preferences, visits, and follow-ups** — preference is stored per member, visits are authored notes, and follow-up work is a normal planning task with a same-wedding supplier foreign key. Creating one requires both supplier edit and planning edit scope. A supplier `booked` status does not create a booking.
- **`budget_allocations`** — planned category/function budgets. These do not represent costs and are not summed into the wedding's existing overall budget.
- **`financial_estimates`** — unbooked expected costs with an explicit active/converted/void state. Converting an estimate during booking creation excludes it from active unbooked totals.
- **`bookings`** — supplier, category, optional source estimate, status (`tentative`, `confirmed`, `cancelled`), agreed amount/currency, and cancellation/refund details. One row represents a shared booking even if it serves several functions.
- **`booking_function_allocations`** — exact amount splits across functions. The sum must equal the agreed booking amount. It is attribution only and never duplicates the booking in wedding-wide totals.
- **`booking_payment_obligations`** — optional deposit/installment/balance schedule with due dates. They are not payment records and need not cover the complete balance.
- **`booking_transactions` / `booking_transaction_contributions`** — manually recorded payments and refunds with contributor lines, authorship, and an idempotency key. They are never represented as bank-verified.
- **`reimbursements`** — internal money transfers between named contributors; exclude them from vendor spend and net paid.
- **`forecast_adjustments`** — signed, reasoned changes to forecasts, separately visible from estimates and bookings.

Show separately: budget, active unbooked estimates, tentative/confirmed agreed bookings, scheduled payment obligations, recorded payments/refunds, reimbursements, and forecast adjustments. Group every total by currency. Do not convert or combine unlike currencies without an explicit conversion policy.

### People, invitations, and responses

- **`guest_households`** — wedding, display/group name, contact name/email/phone, address, and notes. A household is an organizational group, not the identity or RSVP unit.
- **`guests`** — exactly one person row per individual for a wedding, with optional household, contact details, family side, follow-up owner, meal preference, allergies, assistance needs, and notes. Allergies and preferences stay distinct. Shared household email/phone is allowed; duplicate suggestions require a person to review them.
- **`guest_invitations`** — one row per `(guest_id, function_id)`, with independent invited/withdrawn status and plus-one allowance. One named plus-one person may link to each primary guest, and receives their own invitations and responses. Database constraints cap a primary guest at one plus-one.
- **`guest_rsvps` / `guest_rsvp_history`** — one current `yes`, `no`, or `maybe` response per invitation plus append-only response history. Preserve response source, author, note, and update time. Phone responses are recorded by an authorized workspace member. The key remains person+function, never household+function.
- **`guest_portal_links` / `guest_portal_sessions`** — household-scoped link digest, expiry, revocation, and short-lived session digest. Neither raw bearer tokens nor session tokens are stored. Every request checks link and invitation state again.
- **`guest_portal_rate_limits`** — fixed-window counters keyed by HMAC digests; no IP addresses, raw tokens, or user agents are stored.
- **`guest_profile_edit_history`** — old/new meal, allergy, and assistance fields with planner or portal attribution and idempotency key. Planner and portal edits use expected update timestamps and reject stale writes.
- **`guest_import_batches` / `guest_import_rows`** — file fingerprint, counts, author, row-level raw/mapped data, errors, and duplicate-review suggestions. Identical file fingerprints cannot create a second batch. Import never overwrites or merges people.

Household grouping may support contact workflows but does not collapse guest identities or responses. Possession of a household link allows responding for invited members in that household; it never changes household membership, invitation scope, or plus-one approval. Links expire after 30 days by default, can be replaced/revoked, and invalidate existing sessions when revoked.

### Menus, stays, transport, schedules, documents

- **`menus`** / **`menu_items`** — wedding and function, version/status, item name/details, dietary/allergen labels, guest visibility. Treat allergy and accessibility data as sensitive; expose only fields required for service.
- **`accommodation_properties`** — wedding, name/contact/address, status and notes. **`rooms`** — property, label/type/capacity, dates/availability or block terms. **`stays`** — guest, room/property, arrival/departure, status (`tentative`, `confirmed`, `cancelled`), cost responsibility and notes. Do not assume room assignments are confirmed because a room exists.
- **`transport_options`** — wedding/function, mode/provider, route, times, capacity, status. **`transport_assignments`** — guest, option, pickup/dropoff, status. Keep planned and confirmed allocation distinct.
- **`schedule_items`** — wedding/function, title, start/end, location, owner, order, status (`draft`, `confirmed`, `done`, `cancelled`), visibility, updated-at/version. Store timezone at wedding level and timestamp instants consistently.
- **`documents`** — wedding, optional function/record association, private Storage object key, filename/content type/size, category, visibility, uploader, status. Object storage is private; metadata does not grant access by itself.
- **`audit_events`** — wedding, actor, action, entity type/id, timestamp, and minimal change metadata for role changes, invitation claims/responses, financial state changes, and other sensitive operations. Do not put secrets or unnecessary personal data into logs.

## 4. Permission model

All permissions are wedding-scoped. An authenticated Supabase user gains workspace access through an active `wedding_members` row. Guest access is an explicit person link and invitation check, independent of membership. The matrix describes proposed capabilities; RLS and server authorization must enforce them.

| Capability | Owner | Co-owner | Scoped family collaborator | Read-only collaborator | Guest-portal visitor |
| --- | --- | --- | --- | --- | --- |
| View workspace planning data | All | All | In assigned domains | All permitted workspace data | No |
| Edit functions, tasks, decisions | Yes | Yes | If planning scope | No | No |
| Edit vendors, quotes, bookings, costs, payments | Yes | Yes | If suppliers/finance scope | No | No |
| Edit households, guests, invitations, RSVP records | Yes | Yes | If guests scope | No | Own person/function responses only |
| View guest-sensitive dietary/accessibility details | Yes | Yes | Only if guest scope and explicitly needed | No by default | Own disclosed details only |
| Edit menus, stays, transport, schedules | Yes | Yes | If logistics scope (planning scope for menus if approved) | No | Own guest-facing details only |
| Read private documents | All | All | If domain scope and document visibility permits | Only documents explicitly shared with read-only members | Only guest-facing documents explicitly shared with that guest |
| Manage members and scopes | Yes | Proposed yes, except owner transfer/removal | No | No | No |
| Change ownership, archive/delete wedding | Yes | No by default | No | No | No |
| Access another guest's record/response | Yes | Yes | Only with guest scope | No | No |

Owner/co-owner membership changes, ownership transfer, and archive actions should be audited. Scoped collaborators receive only the domains granted; read-only collaborators cannot mutate data. RLS policies should use helper functions that resolve membership and scope from database rows and avoid recursive policy traps. Guest database policies must constrain each query to the linked person and that person's invitations. Service-role access must not bypass policies for normal user traffic.

## 5. Record ownership and status rules

- A guest person belongs to exactly one wedding and has one `guests` record, even when multiple household members share contact details.
- A household groups guest records. It is not the RSVP owner and does not replace person records.
- Each invitation and RSVP belongs to one person and one function. Unique constraints prevent duplicate invitations/responses for that pair.
- A shared booking is represented by one booking row. Function allocations are attribution only; wedding-wide totals count the booking once.
- Quotes, bookings, costs, and payments are different record types with separate lifecycle states. Do not infer a confirmed booking from an accepted quote or infer a paid cost from a planned payment.
- Tentative and confirmed status must be explicit for functions, bookings, stays, transport, and schedules. Draft/planned information must not appear as confirmed in reports or guest-facing views.
- Preserve history for cancellations, voids, RSVP changes, booking changes, and member permission changes. Prefer status transitions and audit events over destructive deletion.
- Currency is stored on each financial amount. The proposed workspace default is one reporting currency; any conversion requires an explicit rate/source/date and separate reporting rule.

### Financial records and totals

- `budget_allocations` records planned category/function budgets; the wedding's overall budget is the comparison ceiling. Allocations are not spend and are not added to it.
- `financial_estimates` holds unbooked expected costs. Creating a booking from one marks that estimate converted in the same transaction, so it is excluded from active estimate totals.
- One `bookings` row represents one agreed supplier amount, in one currency. `booking_function_allocations` splits that total across functions and must reconcile exactly; it is attribution only and never increments wedding spend.
- Booking status is tentative, confirmed, or cancelled. Committed cost includes confirmed bookings only; forecast includes tentative and confirmed bookings. Cancellation preserves payments and notes, and a nullable expected refund distinguishes unknown from zero.
- `booking_payment_obligations` schedules deposits/instalments. `booking_transactions` separately records manual payments and received refunds, with a unique submission key; neither is treated as bank-verified. Contribution rows must add to a payment when supplied.
- Reimbursements are internal transfers between people. They do not increase vendor costs or wedding net paid. Signed `forecast_adjustments` record an explicit reason and currency.
- Every total is grouped by its currency. No foreign exchange is applied. Forecast is explicitly: active tentative and confirmed booking totals + active unbooked estimates + signed forecast adjustments. Net paid is recorded payments less refunds. Outstanding balances are the non-negative balance of active bookings.

## 6. UI navigation and reusable components

### Workspace navigation

Persistent workspace shell: wedding switcher/name, overview, Functions, Tasks & decisions, Suppliers, Budget, Guests & invitations, and Planning/Operations sections for menus, stays, transport, schedule, and documents. Settings and member management appear in a protected footer/menu. Navigation items can be hidden when a role lacks access, but this is only a usability measure; server and RLS checks remain authoritative.

On mobile, use a compact header with an accessible navigation drawer and prominent page title/actions. Tables should reflow to readable cards or horizontally scroll with accessible labels; avoid requiring hover.

### Guest navigation

Separate guest shell with wedding identity, My invitations, travel details when shared, and account. Do not reuse workspace navigation or expose internal workspace terminology.

### Reusable components

- `WorkspaceShell`, `GuestShell`, `WeddingSwitcher`, `MobileNavigation`, `Breadcrumbs`.
- `PermissionGate` for rendering affordances only, paired with server authorization.
- `StatusBadge` with explicit labels and consistent tentative/confirmed/cancelled semantics.
- `EmptyState`, `LoadingState`, `ErrorState`, `PermissionDenied`, and inline validation summary.
- `FunctionPicker`, `PersonPicker`, `HouseholdPicker`, and authorized `MemberPicker`.
- `DataTable` with mobile presentation, sorting, filtering, and accessible row actions.
- `MoneyDisplay` and `MoneyInput` that require currency and avoid implicit conversion.
- `DateTimeInput` that displays the wedding timezone and gives a clear interpretation.
- `RSVPForm` scoped to the signed-in person and function; `InvitationStatusList` for workspace users.
- `BookingStatusForm`, `CostEditor`, `PaymentStatusEditor` with distinct financial states.
- `DocumentUploader` and `DocumentLink` backed by private object authorization.
- `ConfirmActionDialog` for consequential status changes and membership/ownership actions.

Forms should use explicit labels, keyboard-accessible controls, useful field errors, focus management, and mobile-sized targets. Financial, guest, and operational pages must expose loading, empty, validation, permission, and failure states.

## 7. Testing strategy

1. **Unit/business rules (Vitest):** invitation uniqueness and state transitions; per-person/per-function RSVP behavior; household grouping without response aggregation; booking rollups counted once; totals separating estimate/commitment/incurred/paid; tentative versus confirmed display rules; currency mismatch handling; member scope evaluation.
2. **Component tests (Vitest + Testing Library):** labeled mobile-friendly forms, validation summaries, status labels, accessible dialogs, and loading/empty/error/permission states.
3. **Database integration (Supabase local):** migration application, foreign keys/check constraints, uniqueness, no cross-wedding references, RLS matrix for every workspace role, guest own-record restrictions, storage policy paths, and unauthorized write denial.
4. **Browser tests (Playwright):** sign-in/callback flow in a test environment; workspace navigation; create/edit a function and task; invite/claim a test guest; guest RSVP for one function; confirm a guest cannot inspect another person's RSVP or workspace pages; verify a read-only collaborator cannot mutate. Use only synthetic fixtures clearly marked as test data.
5. **Test discipline:** no live messaging, payment, production data, or remote database mutations in tests. Run against local/test Supabase only. Record commands and actual results; do not claim checks that were not run.

## 8. Implementation order

1. Confirm approval decisions below; establish package/app structure and environment-variable handling.
2. Add local Supabase configuration and versioned migrations for wedding, members, membership scopes, and audit events; test RLS before building broad UI.
3. Add authentication, workspace selection, protected route shell, invitation-based member onboarding, and authorization-denied flows.
4. Deliver the functions/tasks/decisions vertical slice with business and database tests.
5. Deliver vendor/quote/booking/cost/payment tracking and tested non-duplicating financial rollups.
6. Deliver households/people/invitations/RSVPs and guest portal, including identity claim and guest isolation tests.
7. Add menus, accommodation, transport, and document storage as separate tested slices.
8. Add schedules, wedding-day views, reminders, and reports.

Keep migrations additive and versioned. For each schema change, document the data impact and a rollback/recovery approach. Do not apply migrations to a remote project without separate approval.

## 9. External integrations to defer

- Email, SMS, WhatsApp, push notifications, and transactional message providers.
- Stripe or other payment gateways; payments are status tracking only in the initial design.
- Google/Microsoft calendar synchronization.
- Accounting/bookkeeping software and bank feeds.
- Maps, geocoding, routing, and live traffic services.
- Vendor CRM/booking platforms and vendor logins.
- E-signature, document scanning/OCR, and external cloud file providers.
- Analytics, advertising pixels, and third-party session replay.
- AI assistants or generative planning features.

## 10. Decisions requiring approval

1. **Stack:** approve Next.js App Router, TypeScript, Tailwind, Supabase Auth/PostgreSQL/private Storage, Vitest/Testing Library, local Supabase integration tests, and Playwright.
2. **First usable version boundary:** approve the proposed inclusion of functions/tasks/decisions, supplier and finance tracking, plus guest invitations/RSVP portal; or identify which should move to later milestones.
3. **Guest identity and onboarding:** choose verified email magic link, another verified method, or both. Proposed security invariant: claim tokens alone never expose private RSVP data.
4. **Household RSVP delegation:** proposed default is individual response only; approve whether an explicitly assigned household coordinator may respond for others.
5. **Wedding settings:** approve one reporting currency and one IANA timezone per wedding for the first version; decide whether multi-currency reporting is required.
6. **Role policy:** approve co-owner ability to manage collaborators but not transfer ownership/archive the wedding; confirm scope categories and whether guest-sensitive details are visible to guest-scoped collaborators.
7. **Guest-visible data:** approve which function, menu, travel, and document fields are visible to guests and when tentative information may be shown.

