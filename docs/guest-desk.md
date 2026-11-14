# Invitations: one link per family

**Pages:** Guests → **Invitations** (`/guests/simple`, the Guest desk) for the couple; `/i/<code>` for each family.
**Migration:** `supabase/migrations/20261120100000_family_invitations.sql` (additive).

The couple's invitation site (the `wedding_invitation` repository) now lives inside this app. Families get
one link that never changes, open the invitation in the site's own design (emblem, temple-door cover,
music, family lines) and reply once for the whole family. The invitation studio, the Invitations page and
the per-person guest links are gone.

## For the couple: the Guest desk

- **Add families.** Paste one family per line: `name, phone (optional), most guests (optional)`, for
  example `Rao family, +91 98765 43210, 4`. Choose the events they're invited to and whose side they're on.
  All or nothing: any problem lists every bad line and adds nothing; the text stays in the box. Names already
  on the list (ignoring case and spacing) and repeats in the same paste are refused. A bare 10-digit Indian
  mobile (starting 6–9) gets `+91`, so WhatsApp opens that chat. Each family also gets one contact person,
  named after the family, so messages and stays have someone to attach to.
- **Each row:** Invite (opens WhatsApp with the message and link; records "sent by you" in Messages),
  Remind (families who haven't replied), Copy link, and under More: change events and most guests, record a
  reply that came by phone, make a new link (the old one stops working), the family's people, Remove.
- **Remove from list** stops the link working and leaves the family out of the counts. The reply is kept;
  Put back makes the same link work again. Deleting a family completely is on the People page.
- **Counts:** families invited / replied / not yet / guests coming; per event, people coming, families not
  coming, families yet to reply. **Download CSV** exports families and replies (formulas defused).
- Families added before this change have no link yet: tap **Make their link**. Their events were copied from
  the per-person invitations they had (the migration's backfill).

## For the family: `/i/<code>`

The invitation site's page, with the events read from **Plan → Functions** (date, time, venue, map link,
dress code) and only the events this family is invited to. Wording, family lines, notes and music are in
`src/config/invitation.ts`. The reply form asks: name, phone, coming or not, how many (up to the family's
limit), which events, food choice and notes, a message. Anyone in the family can reply, from any phone; the
latest reply counts and every version is kept in `family_reply_history`.

English only for now (as on the invitation site). The music is the original Hamsadhwani piece; the
NirvanaSutra track from the old site was not copied because its permission was never confirmed.

## Elsewhere

- **People** (`/guests`): families and the people in them, for stays, rides, seating and food details.
  No per-person invitations or replies any more.
- **Catering:** food counts come from family replies (each family's choice × people coming).
- **Home:** reply progress per event, and "X families · Y of Z replied · N guests coming".
- **Messages:** each family's contact person stands for the family (invited to its events; replied once the
  family has replied), so templates and reminders still reach families.
- Old `/guest#…` links show "This invitation link has changed". `/invitations` redirects to the Guest desk.

## Security and data

- Link codes are 12 random characters (about 70 bits) and are stored, so the same link can be sent again.
  Members who can see the guest list can see them. Anyone holding a family's link can open it, as on the
  invitation site; make a new link if one reaches the wrong people.
- The guest side uses the publishable key only, through `get_family_invitation` and `submit_family_reply`,
  which check the code and return only that family's name, limit, events and reply. Both are rate-limited
  with the existing per-address limiter. Tables have RLS with read for guest-list readers and no direct
  writes; changes go through functions that check guest-edit permission.
- `/i/*` pages send `no-store`, `no-referrer` and `noindex`.

## Database impact (`20261120100000_family_invitations.sql`)

Additive. `guest_households` gains `invite_code`, `invite_max_guests`, `invite_removed_at`. New tables
`family_function_invites`, `family_replies`, `family_reply_history`. Backfill: each family is invited to
the active functions its people are invited to today. Per-person invitations, replies, links, proxies,
invitation designs and media stay in place, unused, until a later migration removes them with approval.

## Checks

Database: `tests/family-invitations-db.test.ts`. Rules and paste: `tests/family-invites-rules.test.ts`.
Actions: `tests/family-invites-actions.test.ts`. Signed-in journey (staging only):
`tests/signed-in.spec.ts`, "guest desk: …".
