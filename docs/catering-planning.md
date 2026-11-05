# Catering planning

The `/logistics` workspace manages meals attached to existing wedding functions. A meal service can link to an existing booked supplier and an existing financial booking. The booking remains the canonical expense record and is counted once in wedding finance totals.

## Count ownership and calculation

Invited and confirmed totals come from distinct individual invitations for the function. A confirmed person is an invited person whose RSVP is `yes`; `no`, `maybe`, and unanswered responses are not confirmed. Household membership does not change this calculation. A person has at most one meal-category assignment per meal service; adult and child are assigned at the individual level. Vendor and staff meals are entered separately.

For the expected catering count, adult and child categories use their entered manual expected count when present; otherwise they use accepted RSVPs assigned to that category. Vendor and staff categories require manual expected values before a final snapshot can be captured. The service total is the sum of these category values. The final count is `max(expected count, approved guarantee) + agreed buffer`. A missing manual value remains unknown. Per-plate rates are stored as exact PostgreSQL decimals in one explicit currency per meal service. The rate estimate stays separate from an existing booking, and changing currency is blocked while rate entries exist.

The approved guarantee is set only by an explicit planner action. RSVP changes never modify it. Count snapshots are append-only and preserve invited, confirmed, manually entered, guarantee, buffer, category, final count, deadline, and linked-booking inputs at the time captured. When responses differ from the latest snapshot after the deadline, the page flags the difference for review.

## Privacy and access

All catering rows are wedding-scoped and protected by row-level security. Each server operation refreshes module permissions. Logistics collaborators can see meal planning, guest names needed to assign a meal category, RSVP status, and aggregated dietary preference/assistance summaries. Individual allergy detail is returned only to owners, co-owners, or a collaborator with guest edit access, through a dedicated authorization-checked database function. Allergy values are not included in general catering queries.

## Menus, tastings and print

Menus are versioned. New versions start as drafts; approval retains prior versions as superseded history. Tasting appointments and feedback are retained with the relevant meal service. The print action uses the browser print dialog and does not send or persist data.

## Migration and local verification

Migration `20261104200000_catering_planning.sql` adds catering tables, constraints, policies, and authorization-checked database functions. It adds no duplicate guest, supplier, booking, or payment records. Apply it only to a local database or after separate approval for a remote project. The current test suite applies this migration in PGlite and checks count snapshots, duplicate prevention, guarantee stability, post-deadline RSVP changes, and allergy access.
