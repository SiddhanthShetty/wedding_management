# Wedding Planning App — Product Plan

**Status:** Proposal for approval  
**Repository assessment:** The repository contains only `AGENTS.md`. There is no established application stack, data model, UI, or test suite. The proposed stack therefore follows the project brief: Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/private Storage, Vitest, and Playwright.

## Product goal

Give a couple and their authorised helpers one private place to plan wedding functions, coordinate decisions and suppliers, manage the guest list and per-function responses, and keep operational information ready for the wedding. Invited guests get a separate, narrow portal for their own invitations and responses.

## Product scope

### First usable version

- Create a wedding workspace with its owner, co-owner, and invited collaborators.
- Manage multiple functions, with date/time, venue, status, and function-specific notes.
- Track tasks and decisions with owners, due dates, status, and links to a function or supplier.
- Keep a supplier shortlist; record quotes, bookings, costs, and payment status. This is tracking only: no payment collection.
- Manage households and individual people, create invitations per person and function, and record each person's RSVP per function.
- Provide a private guest portal that shows only the authenticated guest's invitations and supports their own responses.
- Show a planning overview with upcoming tasks, function status, guest response counts, and clearly separated estimated, committed, and paid totals.
- Enforce wedding membership and guest access in server code and PostgreSQL policies.

### Planning expansion

- Function menus and dietary requirements, with appropriately restricted access to sensitive notes.
- Accommodation properties/rooms, guest stays, and room allocation.
- Transport options, routes, and guest allocations.
- Private document library, task reminders, decision history, and operational reports.
- More detailed budget categories, quote comparison, booking change history, and exports.

### Wedding-day operations

- Time-ordered schedules per function, with location, owner, status, and change history.
- Mobile-friendly run sheets and role-specific views for authorised helpers.
- Day-of checklists, contact sheets, transport/rooming lists, and document access.
- Clear last-updated information and an audit trail for operational changes.

### Deferred enhancements

- Vendor accounts and vendor-facing collaboration.
- Direct email/SMS/WhatsApp sending, calendar sync, payment processing, accounting integrations, and map/geocoding services.
- Automated seating plans, public wedding websites, gift registries, AI planning, multi-wedding agency accounts, and native mobile apps.
- Any feature requiring a third-party account or transmitting guest data externally.

## Proposed delivery order

1. **Foundation:** app shell, environment setup, Supabase local development, versioned schema migrations, authentication, wedding membership, RLS, and authorization tests.
2. **Planning core:** wedding workspace, functions, tasks, and decisions.
3. **Supplier and finance tracking:** vendors, quotes, bookings, costs, and payment records with non-duplicating totals.
4. **Guest management:** households, people, per-person/per-function invitations and responses, then the restricted guest portal.
5. **Planning expansion:** menus, rooms/stays, transport, documents, reminders, and reports.
6. **Wedding-day operations:** schedules and mobile run sheets.

Each step should be a complete vertical slice with loading, empty, validation, permission-denied, and failure states. Do not seed demo records into real wedding data; any fixtures or sample workspace must be explicitly labelled and isolated.

## Product decisions proposed for approval

1. Approve the proposed stack and phased scope above.
2. Confirm whether the First Usable Version should include both supplier/finance tracking and the guest portal, or whether either should move to a later milestone.
3. Confirm guest response policy: proposed default is that a guest can respond only for their own person record; delegated household responses would require an explicit permission and audit trail.
4. Confirm the wedding's reporting currency and timezone model before implementing totals, dates, and schedules. Proposed default: one currency and one IANA timezone per wedding, stored explicitly.
5. Confirm collaborator scope categories before implementation. Proposed categories are planning, suppliers/finance, guests, and logistics; read-only is a separate access level.

