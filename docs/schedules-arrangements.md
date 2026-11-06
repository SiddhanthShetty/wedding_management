# Schedules, Issues & Arrangements

**Routes:** `/schedule` (navigation: “Schedules”) and `/schedule/pack` (printable operational pack). **Module:** `logistics`.
**Migration:** `supabase/migrations/20261106110000_schedules_arrangements.sql` (additive only).

## What it does

- **Function timeline (run sheet):** per function — activity, location, planned start/end, actual start/end, owner (member, or a named non-member), backup contact, linked vendor and vendor arrival time, setup and pack-up requirements, dependencies (“happens after”), status (`planned`, `confirmed`, `in_progress`, `delayed`, `done`, `cancelled`) and delay note. Quick actions: *Started now*, *Done now*, *Record delay*.
- **Vendor arrival view:** every item with a linked vendor, ordered by arrival time, with setup needs and vendor contact.
- **Coordinator view:** open items, unresolved issues and unfinished arrangements grouped by owner.
- **Issue list:** severity (`low` → `critical`), owner, status (`open`, `in_progress`, `resolved`). Resolving needs a note.
- **Arrangements:** decor references and approved designs, outfits and fitting dates, ceremony materials, gifts and welcome hampers (with quantity), photography shot lists, music and performances, plus a checklist per arrangement.
- **Operational pack:** printable run sheet, open issues and arrangement checklists for one or all functions.

## Delays and warnings

Recording a delay or an actual time changes only that item. Nothing is moved automatically. The app instead warns about:

- one owner responsible for overlapping items (members by id, others by normalised name)
- two items overlapping in the same location
- an item planned to start before something it depends on ends
- a vendor arriving after the item starts
- an item outside its function's scheduled window
- items downstream of a late item (“may be affected… not moved automatically”)

Intervals are half-open, so back-to-back items do not count as overlapping. Rules live in `src/lib/planning/operations-rules.ts` and are tested in `tests/operations.test.ts`.

## Database rules

- Planned end after start (max 24 h). A `delayed` item must have a delay note. Resolved issues must have `resolved_at`, and other issues must not.
- Schedule dependencies cannot form a cycle (`guard_schedule_dependency_cycle`).
- Design approval is stored with its approver; changing the reference link clears the approval. Reference links must be `https://`.
- Items, issues and arrangements cannot be deleted (cancel or resolve them). Dependencies and checklist lines can be removed by editors.
- Every table is wedding-scoped with composite foreign keys and logistics read/edit RLS. Function and vendor names reach logistics members through `get_operations_references`, which checks logistics read access.

## Printed and offline information

- **Offline viewing and editing are not implemented.** No service worker or offline cache is added, and the app needs a connection to load or change schedules.
- The operational pack is a **snapshot**. Every section prints “Generated <time> (<timezone>)” and a notice that later changes are not included. It contains private contact details, so the page asks readers to keep printouts secure and destroy them after the event.
- A browser may keep a recently viewed page in its own history cache. That is browser behaviour, not an app feature, and it is not described as offline support.

## Known limitations

- Decor references and designs are links only. File attachments arrive with document storage (Feature 3).
- Arrangement visibility follows the logistics module; there is no separate “planning-only” arrangements permission.
- Not verified in a browser against a database with this migration applied (see the deployment note in `docs/accommodation-transport.md`).
