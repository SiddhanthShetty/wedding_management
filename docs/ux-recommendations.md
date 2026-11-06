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
