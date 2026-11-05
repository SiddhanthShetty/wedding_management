# Master guest-management module

Migration `20261104160000_guest_management.sql` adds the wedding-scoped household, individual guest, function invitation, current RSVP, append-only RSVP history, and CSV import batch/row tables. It adds no sample guest rows and does not change existing wedding records. Direct table writes are revoked; authenticated edits use server-authorized database functions and the existing `guests` module permission.

Households store group/contact details. Each person stays a separate guest record, including meal preference, allergies, and assistance needs. Invitations and current RSVPs are keyed to a person and a function. A household does not imply a shared invitation or response. RSVP rows and history preserve response source, author, and timestamp; authorized workspace users can record phone responses.

A primary invitation may approve a plus-one for a function. The plus-one must be a named individual guest, gets their own function invitation and RSVP, and a database uniqueness rule permits no more than one plus-one person for each primary guest in a wedding. The plus-one may be invited to multiple functions only where the primary invitation explicitly allows it.

The invitation matrix stages changes for the selected function and saves them with one button. A versioned RPC applies the batch in one database transaction; if any guest/function pair is invalid or a plus-one is not approved, the whole batch rolls back. Migration `20261104180000_bulk_guest_invitations.sql` adds only this RPC and its execute grant. It does not alter guest data or invitation records. The migration is local and requires separate approval before remote application.

CSV import maps headers before preview. Row validation errors and server-found duplicate suggestions are shown before submission. Import creates new people only; it never updates or merges existing people or matches an existing household by name. A duplicate requires an explicit per-row “import as a separate person” choice. If a possible duplicate is left for review, the batch retains that row and provides an explicit later resolution action. A wedding-scoped SHA-256 file fingerprint rejects a repeated file. Batch rows retain raw columns, normalized values, status, errors, and suggestion IDs for troubleshooting.

CSV export requires guest-module read access. Owners, co-owners, and guest-module editors can export contact and dietary/assistance details. Read-only guest-module collaborators receive a reduced export without contact or sensitive needs fields. Every exported cell is quoted, and formula-like leading characters are escaped.

## Private household portal

Migration `20261104170000_private_guest_portal.sql` adds HMAC-digested household links and portal sessions, hashed rate-limit buckets, profile edit history, and submission attribution. It also adds an optional HTTPS guest map URL to functions and upgrades planner guest and RSVP edits to use optimistic concurrency. It retains the existing guest, invitation, and RSVP records and does not send invitations or alter existing responses.

The portal uses a fragment token exchange, a short-lived HttpOnly session cookie, no-store/no-referrer/noindex response controls, PostgreSQL scope checks on every operation, and generic invalid/expired/revoked responses. Only invited people and their active function invitations appear. Each person saves changed responses for all their invited functions with one button; one stale response rolls back that person's entire batch. Migration `20261104190000_private_guest_portal_bulk_rsvp.sql` adds the scoped batch RPC without changing existing table data. Dietary and assistance details keep their separate save action. See [guest-portal.md](guest-portal.md) for environment configuration and security details.

Migrations `20261104180000_bulk_guest_invitations.sql` and `20261104190000_private_guest_portal_bulk_rsvp.sql` are versioned locally and have not been applied remotely. Stay, pickup, arrival/departure, and menu details are not yet persisted by the logistics module, so they remain unavailable in the portal until a separate logistics slice exists.
