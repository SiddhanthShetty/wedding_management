# Stays & Transport

**Route:** `/travel` (navigation: “Stays & Transport”). **Module:** `logistics`.
**Migration:** `supabase/migrations/20261106100000_accommodation_transport.sql` (additive; replaces `get_guest_portal_data` to add confirmed stays and shared journeys).

## What it does

- **Guest needs** per existing guest: room, arrival transport and departure transport are each `unknown`, `required` or `not_required`. “Not assigned” is derived: required + no active allocation. An allocation always shows as “Allocated”.
- **Manual travel details** (arrival/departure time and free-text details such as a flight number) record who entered them and when. The UI labels them “Manually entered · not live-verified”. No identity-document fields exist; the notes field asks people not to enter passport numbers.
- **Accommodation:** properties → room types (occupancy limit and extra beds per room) → rooms (placeholder labels until numbers are confirmed) → nights held per room type (proposed hold or confirmed block) → guest stays (proposed / confirmed / cancelled, payment responsibility, special requirements).
- **Transport:** vehicles (seats, driver), travel groups, journeys (arrival / departure / transfer) acting as pickup tasks with coordinator and status `planned → assigned → collected → completed` (or cancelled), passengers.
- **Summaries:** hotel rooming lists (confirmed only by default) and driver run sheets, printable, stamped with their generation time.

## Rules enforced in the database

| Rule | Where |
| --- | --- |
| Stay nights are `[check_in, check_out)`; the check-out day is not a night | `validate_accommodation_assignment` |
| Every night must be held for the room type (`rooms_held > 0`) | same |
| Guest cannot have two active stays covering one night | same |
| Room occupancy and extra beds per night | same |
| Distinct rooms in use per night ≤ rooms held | same |
| Reducing held rooms / occupancy below current use is rejected | `guard_accommodation_inventory`, `guard_accommodation_room_type` |
| Journeys are `[pickup, drop-off)`; a vehicle cannot be on overlapping active journeys | `validate_transport_journey` |
| Passengers ≤ seats (on boarding, vehicle change and capacity edits) | `validate_transport_passenger`, `guard_transport_vehicle` |
| A guest cannot be on two overlapping journeys | both journey triggers |
| Assigned/collected/completed journeys need a vehicle; only those with a vehicle can be shared with guests | check constraints |

Checks take a per-wedding advisory lock so concurrent saves cannot both pass. Stays and journeys use a `version` column; stale edits are rejected rather than overwriting.

## Permissions

- Logistics read: view everything in `/travel`. Logistics edit: change it. RLS enforces both.
- Guest phone numbers in summaries need guest-module read access; assistance needs need owner/co-owner or guest edit access (`get_travel_guests`).
- Stays and journeys cannot be deleted (cancel instead). Structural rows (properties, rooms, nights, vehicles, groups, passengers) may be deleted by editors when nothing depends on them.

## Guest portal

Guests see only **confirmed** stays (property, address, guest-facing notes, room type, dates, check-in/out times) and journeys explicitly marked **Share with guests**. Room numbers, room-mates, payment responsibility, drivers and internal notes are never included.

## Known limitations

- No booking or cost link for properties yet. Payment responsibility is a label, not a financial record.
- Journeys are not converted into planning tasks; the journey itself is the pickup/drop-off task.
- Not verified in a browser against a database with this migration applied: `.env.local` targets the linked remote project and applying migrations there needs separate approval.
