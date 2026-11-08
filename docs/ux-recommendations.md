# Making Wedding Desk Friendlier: Gaps and Recommendations

## Implementation status (2026-11-06)

| Step | Status | Where |
| --- | --- | --- |
| 1. Grouped navigation, “What needs you today”, plain-language statuses, “?” help | Done | `src/lib/navigation.ts`, `src/lib/planning/attention.ts`, `src/lib/planning/status-vocabulary.ts`, `src/components/term.tsx` |
| Invitations (Option A) | Done | [invitations.md](./invitations.md) |
| 2. Setup checklist, starter functions and tasks, ready-made reminder, smart defaults (run-sheet times, stay dates, suggested pickups) | Done | `src/lib/planning/starter-templates.ts`, `src/components/setup-checklist.tsx` |
| 3. Bulk actions (invite a household, place a household in rooms, complete many tasks, links for every household) and one-click reminders | Done | `src/lib/data/bulk.ts`, `/messages?function=…&kind=reminder` |
| 4. Day-of screen (`/today`); guest portal itinerary, add-to-calendar, map links, one-tap replies, “reply for everyone” | Done | `src/components/day-of.tsx`, `src/lib/guest-portal/itinerary.ts` |
| 5. Guests and Wedding week areas with section tabs, “Files” links on records, streamed Overview, remembered views, “show more” paging | Done | `src/lib/navigation.ts` (`AREAS`), `src/lib/data/dashboard.ts` |
| Dark mode | **Not done** | Needs a visual design pass: 33 hard-coded light surfaces, and no way to check it visually in this environment |
| Lint and accessibility checks in CI | **Not done** | Needs your decision on adding ESLint (and axe) as dev dependencies |
| Shareable read-only links for drivers or vendors; offline run sheet | **Not done** | New public-token access paths need a separate security design and approval |
| Drag-and-drop boards, quick-add bar, per-category budget bars, “who paid what” settle-up, payment reminders | **Not done** | Later candidates; not in the agreed steps |

The rest of this document is the original analysis.

---

Based on a review of the app after the five milestones. Ordered by impact for a couple and their family using it week to week.

## 1. First-run and navigation

| Gap | Recommendation |
| --- | --- |
| The sidebar now has 13 entries, and new users don't know where to start. | Group the navigation into **Plan** (Functions, Tasks, Decisions), **Money & suppliers** (Venues & Vendors, Budget), **Guests** (Guests, Messages), **Wedding week** (Catering, Stays & Transport, Schedules) and **Files** (Documents). Collapse groups the member cannot access. |
| The overview's “Getting started” checklist only appears for an empty wedding. | Keep a dismissible setup checklist (wedding details, first function, first guest, first vendor, invite partner) with progress, until every step is done. |
| Only one wedding per account is reachable. | Add a wedding switcher in the sidebar (the `wedding_members` model already supports several). |
| “Help centre · preview” is a dead link. | Replace it with short in-app help panels per page (what this page is for, and what “tentative / confirmed / not assigned” mean). |

## 2. Forms and editing

| Gap | Recommendation |
| --- | --- |
| Long pages put every edit form inside `<details>`, which is hard to scan on mobile. | Use one consistent pattern: a list with a single **Edit** button that opens a sheet or dialog (the Functions and Tasks pages already do this). |
| Some pickers use `<select multiple>` (travel groups, passengers, dependencies), which is awkward on phones. | Replace them with a searchable checklist, and add “select whole household” or “select travel group” shortcuts. |
| Times are typed per form in the wedding timezone. | Default new schedule items, journeys and stays to the selected function's date, and offer “+15 min” and “same as previous end” shortcuts. |
| Success messages appear next to the button and are easy to miss. | Use the existing toast (`NotificationRegion`) for success, keep inline messages for errors, and move focus to the first invalid field. |
| Conflict errors (“changed by someone else”) ask for a refresh. | Show what changed and offer “reload this record” in place, without losing the user's unsaved input. |

## 3. Guests and RSVPs

| Gap | Recommendation |
| --- | --- |
| Portal links are created per household and shown once. | Add a bulk “create links for all households without one” action with a printable or exportable list for hand-delivery. |
| Reminders need a template, a function and manual copying. | Offer one-click “prepare reminders for everyone who hasn't answered” from the RSVP progress card. |
| No visible RSVP deadline. | Add an RSVP deadline per function, show it in the portal and on the dashboard, and let reminders target it. |

## 4. Wedding week

| Gap | Recommendation |
| --- | --- |
| No single “today” view. | Add a **Day-of** page: the current and next schedule item per function, late items, open critical issues and the next vendor arrivals. Use large text and few controls, suitable for a coordinator's phone. |
| Rooming and transport are allocated one guest at a time. | Allow drag-and-drop or batch allocation (“put this household in these two rooms for these nights”), using the existing capacity checks as live feedback. |
| Offline use is not supported. | If the venue has poor signal, add an explicit read-only offline copy of the operational pack with an expiry and a visible generation time, as described in `schedules-arrangements.md`. |

## 5. Money

| Gap | Recommendation |
| --- | --- |
| Budget numbers are correct but dense. | Add a simple per-category bar (budget vs forecast vs paid), and a “who has paid what” view from the existing contribution lines. |
| Upcoming payments have no reminders. | Add in-app reminders N days before a due date. Email or SMS can follow later, through the provider design. |

## 6. Accessibility and polish

- Run an automated audit (for example axe in Playwright) on each signed-in page once a local Supabase is available.
- Respect `prefers-reduced-motion` and add a dark theme, since the app is used in the evenings.
- Use consistent status vocabulary everywhere: *Tentative / Confirmed / Cancelled* for arrangements, and *Not required / Unknown / Not assigned / Allocated* for needs. Show a short legend on each page.

## Suggested next milestone

Grouped navigation + wedding switcher + Day-of view. These help every user most and need no schema changes, apart from an optional RSVP deadline column.

## Phased simplification plan (2026-11-08; wedding in December 2027)

A review of every page as a first-time user produced 45 suggestions, scheduled to match the planning calendar:
- **Phase 1:** foundations, now.
- **Phase 2:** venues, vendors and budget, Jan–Apr 2027.
- **Phase 3:** guest list and Save the Date, May–Jul 2027.
- **Phase 4:** invitations, replies, catering and travel, Aug–Oct 2027.
- **Phase 5:** wedding month, Nov 2027.

### Phase 1, done (2026-11-08)
- **India-first defaults.**
  - New weddings use India (IST) and rupees whatever the device says (couples often plan from abroad), with "Wedding not in India?" to change.
  - Dates are formatted for India (`en-IN`). Pickers list common time zones and currencies first (`src/lib/locale.ts`).
- **Time zone check on Overview.** A notice appears when the wedding's time zone differs from the device's, or when the budget is in rupees but the wedding time zone is outside India. The second check catches a wedding set to the planner's own time zone (as happened with Europe/Dublin).
- **Simpler first setup.** Your name, your partner's name, wedding date with "The date isn't final yet", and city. The workspace name is generated from the first names. Settings shows names, date, city, time zone, currency and budget, with workspace name and notes under "More details".
- **Plain words.** Jargon is replaced in visible text (proxy, matrix, batches, allocations, snapshot, guarantee, forecast adjustments, reimbursements) and page introductions are shortened. Code names are unchanged.
- **Footer line removed.**
- **Functions.**
  - "Start with the usual functions" adds Haldi, Mehendi and Sangeet on the day before, Muhurtham and Reception on the wedding day (engagement and Grihapravesha optional), all marked "not confirmed yet" and skipping names that already exist.
  - Type field with suggestions; the form shows key fields, with map link, guest count, budget, person in charge and notes under "More details".
  - Plain schedule lines; the list becomes cards on phones (the `stack-on-phone` table style, reusable on other pages).
- Short forms with "More details" and hidden empty sections elsewhere come with each page's own phase, so those pages aren't reworked twice.
