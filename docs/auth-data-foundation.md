# Authentication and Data Foundation

**Status:** Foundation, setup, and planning migrations are applied to the linked development project. The supplier directory migration is local and pending remote deployment approval.  
**Scope:** Profiles, wedding setup, memberships, module-level collaborator permissions, functions, tasks, decisions, suppliers/venues/quotes, local fixtures, and protected workspace access.

## Identity and ownership

- Supabase Auth owns credentials and session identity. Each partner signs up with their own email/password account.
- A database trigger creates a `public.profiles` row for every Auth user. Only the user's own profile and display names for active members of a shared wedding can be read.
- `public.create_wedding` accepts a name, timezone, and currency, then derives the owner from `auth.uid()`. The caller cannot pass another user or wedding ID as owner.
- `public.add_wedding_member_by_email` lets an existing owner/co-owner add an already registered, email-verified account. No email is sent. Both partners can have the `owner` role on one wedding.
- A member's active status and module grants are re-read for each server-side access operation. Revocation changes the database row to `revoked`; it does not delete history. The next DAL request and RLS query deny workspace access.

## Roles and module grants

| Role | Effective access |
| --- | --- |
| Owner | Read and edit every module; can manage collaborators and owners; cannot revoke their own membership or remove the final active owner. |
| Co-owner | Read and edit every module; can manage scoped/read-only collaborators; cannot assign owner/co-owner roles or revoke an owner. |
| Scoped collaborator | Access only to assigned modules, independently at read or edit level. |
| Read-only collaborator | Access only to assigned modules at read level; edit grants are rejected by both the server and database. |

Modules are `planning`, `suppliers_finance`, `guests`, and `logistics`. Owners receive effective access without permission rows. Direct membership and permission table writes are not granted to application users; constrained database functions perform those changes.

## Data integrity and security

- Every wedding-owned row in this slice (including functions, tasks, supplier records, quote and visit history, comments/checklists/activity, decisions, options/preferences/comments/activity) has a non-null `wedding_id`.
- Functions reference a creator membership from the same wedding with a composite foreign key. Module permission rows reference a membership in the same wedding with a composite foreign key.
- RLS is enabled on profiles, weddings, memberships, permissions, functions, and supplier/planning tables. `anon` has no grants. Authenticated users receive only required table/column grants plus operation-specific policies.
- RLS helper functions live in a non-API `private` schema. Privileged RPC functions use a fixed empty `search_path`, validate `auth.uid()`, and are executable only by authenticated users.
- Application reads and mutations use the session's publishable-key client. No service-role or Supabase secret key is used. The database independently rechecks RLS.
- `src/lib/auth/access.ts` is the server-side access layer. It verifies the Auth user, active wedding membership, and requested module level for each operation; it intentionally does not cache membership grants across requests.
- Workspace routes are request-time authenticated. Module routes also verify their module permission; Settings requires owner/co-owner membership. The Next.js proxy refreshes cookies but is not treated as the authorization boundary.

## Migration and data impact

`supabase/migrations/20261104000000_auth_wedding_foundation.sql` is additive. It creates the initial tables, enum types, trigger, authorization helpers/RPCs, grants, and RLS policies. It backfills one profile row for each Auth account that already exists. It does not delete or modify Auth accounts, and it does not include real wedding data.

`supabase/migrations/20261104120000_wedding_setup_and_functions.sql` adds couple display names, a target/confirmed date, locations, overall budget, and planning notes to each wedding. It adds local function date/time, type, attendance, budget allocation, coordinator label, dress code, notes, and archive timestamp. Existing function timestamps are projected into the wedding timezone. UTC timestamps remain available for ordering and integrations. Function hard-delete permission is revoked; existing function rows are retained.

`supabase/migrations/20261104130000_tasks_and_decisions.sql` adds planning tasks, append-only task comments and activity, checklist items, decisions, decision options, individual member preferences, decision comments, and activity history. It adds indexes and wedding-scoped foreign keys. Task and decision updates increment a version used for optimistic conflict detection. Dependency cycles are rejected in a database trigger. No task, comment, checklist, decision, option, or activity rows are deleted by this application slice.

`supabase/migrations/20261104140000_supplier_directory.sql` adds wedding-scoped suppliers, venue details, event spaces, availability observations, immutable dated quote versions/line items, member preferences, visit notes, and a supplier foreign key on planning tasks. RLS uses the `suppliers_finance` module. New rows are additive; no tables or wedding records are dropped. Supplier quote, availability, and visit histories are append-only. Supplier policy states, capacities, availability checks, quote totals, and line-item amounts can remain unknown. “Booked” is a shortlist status and does not create a booking. Quote documents are deferred until private document storage exists.

Function schedule changes list linked tasks and leave task due dates untouched. Booking references remain plain text because booking records are not yet implemented. Booking and invitation tables are not yet connected to functions.

`supabase/seed.sql` creates two unrelated synthetic weddings and five `.test` identities for local-only verification. They have no usable passwords. The seed includes two separate owners on Wedding Alder, a scoped collaborator, a read-only collaborator, and an unrelated Wedding Birch owner. It is not intended for a hosted wedding project.

`supabase db reset` is destructive to the **local** Supabase database and recreates it from the local migrations and seed. Never use `--include-seed` on a hosted project.

## Local environment

Copy `.env.example` to `.env.local`. Start the local Supabase stack and copy its generated URL and publishable key into `.env.local`:

```sh
npx supabase start
npx supabase status
```

Set only these app variables:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<generated local publishable key>
```

The publishable key is intended for client applications. Never put a Supabase secret/service-role key in `.env.example`, a `NEXT_PUBLIC_` variable, a browser bundle, or routine request code. The foundation does not require one.

### Hosted development project (no Podman)

For development against a separate hosted Supabase project, copy that project's **Project URL** and **publishable key** from its Connect panel into the ignored `.env.local` file. Do not use the existing production project's credentials for development, and do not put a secret/service-role key in app environment variables.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<development-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<development-project-publishable-key>
```

Then run the Next.js app directly; `npx supabase start` is only needed for a local container stack:

```sh
npm run dev
```

Remote CLI operations do not require Podman, but they do target and can mutate the linked hosted project. After creating the development project, link it explicitly and inspect its migration state:

```sh
npx supabase login
npx supabase link --project-ref <development-project-ref>
npx supabase migration list --remote
npx supabase db push --remote --dry-run
```

Review the dry-run output before applying anything. `npx supabase db push --remote` applies remote migrations and requires separate approval. Never use `db reset --remote` or `--include-seed` for a hosted project; `supabase/seed.sql` contains synthetic local-only fixtures.

Apply the migration and synthetic fixtures to a disposable local database:

```sh
npx supabase db reset
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100/sign-up`. In the local config, email confirmations are disabled and local SMTP is a test sink. Create Partner One's account and wedding. Create Partner Two's account, sign out from the setup screen without creating another wedding, then sign in as Partner One and add Partner Two's verified email as an Owner from Settings. Partner Two can then sign in to the same wedding from their separate account.

## Tests

`tests/security.test.ts` and `tests/planning.test.ts` run the committed SQL migrations and `supabase/seed.sql` in PGlite, a local PostgreSQL-compatible test engine. They cover anonymous denial, Wedding A/B isolation, same-wedding dual owners, profile creation, read-only write denial, module permission limits, self-promotion denial, same-wedding foreign-key enforcement, access revocation, function schedule validation and archiving, task permissions and circular dependencies, overdue logic, decision preferences and stale edit conflicts, supplier filtering/comparison, quote history, unknown values, and supplier permissions.

Run the checks with:

```sh
npm run test:security
npm run test:smoke
npm test
```

The PGlite suites exercise the actual migrations, policy logic, date rules, dependency constraints, version conflicts, and archive retention without a running Docker/Supabase service. `npm run db:reset` and Supabase Auth end-to-end behavior require the Supabase local stack.

## Current limitations

- Overview, logistics, and documents remain labeled synthetic UI previews; their demo records are not persisted to this schema. Wedding setup, functions, tasks, decisions, suppliers, finance, and the master guest workspace use the authenticated database.
- There is no public account recovery or password reset flow yet.
- Membership management accepts an existing verified account email; it does not send invitations or create accounts on behalf of partners.
- Only the earliest active wedding membership is selected by the shell because the previous shell routes do not include a wedding ID. Tenant RLS and DAL methods accept explicit wedding IDs and reject cross-wedding access.
- Supplier follow-up tasks use a same-wedding supplier link and require planning edit permission in addition to supplier edit permission. Financial records and master guest data are represented by the 15:00 and 16:00 migrations and are not yet applied to the hosted development project.
- The hosted development project should be checked with `npx supabase migration list --remote` and `npx supabase db push --remote --dry-run` before approval to apply pending migrations. Do not run the actual remote push without separate approval. The previously connected production project has a different schema and has not been changed.
- The local Supabase container stack was not available during this implementation. PGlite migration/policy tests and TypeScript checks were run; Supabase Auth end-to-end and browser flows with real database persistence remain unverified here.

