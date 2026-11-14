# Simple guest desk (Phase 1)

`/guests/simple`, the first tab under **Guests** (the Guests menu entry now opens it). It sits on top of the
single guest list: households, people, invitations, replies, private links and the message log. It adds no
second list, reply store or link system.

## What it does

- **Add families.** Paste one family per line: `name, phone (optional), number of guests (optional)`,
  e.g. `Rao family, +91 98765 43210, 4`. `Rao family, 4` also works. Choose the functions (all active ones
  ticked), the side and the invitation language. All or nothing: any problem lists every bad line and adds
  nothing; the text stays in the box. Names already on the list (ignoring case and spacing) and repeats in
  the same paste are refused as line problems. Bare 10-digit Indian mobiles (starting 6–9) get `+91`.
- **People.** The lead person is named after the family; with 4 guests you also get "Rao family guest 2…4".
  All are placeholders until someone renames them (a planner on People & RSVPs, or the family once, on
  their invitation page with "Add name").
- **One link per family.** The lead's individual link, with proxy access to everyone else in the family.
  Right after adding, a "Send their invitations now" list shows each link once, inside a WhatsApp button.
  Later, "Invite on WhatsApp" / "Invite again" makes a fresh link (with the existing warning that the old
  one stops working). A fresh link answers for the same people as the old one; if the old one answered
  for nobody else (made on the Invitations page), it covers the whole invited family.
- **Remind** (families not yet replied, after an invite was recorded): either "use the link you already
  have" (only while that link still works) or "Send a fresh link" (after confirmation).
- **Recording sends.** "I sent it" records the invite in the message log exactly as the Invitations page
  does (needs a default design), or records the reminder (`remind:<guest>:<date>`, at most one a day per
  family). The link is never stored in the log.
- **Remove from list** withdraws the family's invitations and cancels their link. People, replies and
  reply history are kept. "Put back" (under "Not on the invite list") re-invites them to the withdrawn
  functions that are still on; send them a new link afterwards. Permanent deletion stays on People & RSVPs.
- **Guest page:** "All of us, to all events" saves "Yes" for everyone on the link, through the existing
  per-person batch reply function (stale-write and duplicate checks; each person all-or-nothing). If a
  later person fails, the page says whose answers were saved. It asks first only when it would change an
  answer already given.

## Database impact: `20261119100000_simple_guest_desk.sql`

Additive only. Nothing existing is changed or removed; existing links keep working.

- `guests.is_placeholder boolean not null default false`. Existing rows stay `false`. A trigger sets it to
  `false` whenever a name changes.
- `create_guest_families_bulk(...)`: one transaction, guests-edit permission, per-wedding advisory lock,
  refuses duplicates without writing.
- `set_guest_household_invited(...)`: Remove / Put back (guests-edit permission).
- `get_guest_portal_placeholders(session)` and `rename_guest_portal_placeholder(session, ...)`: anon,
  session-scoped, only for people the link may answer for, rename once, recorded in
  `guest_profile_edit_history` with old and new name.

**Order matters:** apply the migration before (or together with) deploying this code. Without it the desk
page shows its error state; the guest page keeps working without "Add name".

## Checks

- Database (PGlite): `tests/guest-desk-db.test.ts`. Rules: `tests/guest-desk-rules.test.ts`. Action:
  `tests/guest-desk-actions.test.ts`.
- End to end (signed in, creates TEST families): `tests/signed-in.spec.ts`, "guest desk: …", with
  `E2E_TARGET=staging` against the staging project (see `docs/staging.md`).

## Limits (Phase 2 candidates)

- Links are shown once and expire after 30 days (the database allows at most 31). Families invited early
  will need fresh links; Phase 2 decides on storing encrypted tokens so links can be re-sent.
- "Put back" can't tell invitations withdrawn by Remove from ones withdrawn earlier on People & RSVPs.
- Hindi, Kannada and Tulu wording for the new buttons and reminders are drafts for native-speaker review.
