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

### Quick fixes, done (2026-11-11)
From the second new-user review (46 suggestions; 8 marked "Now"):
- **Bigger text (#1).** 92 style rules raised: 9px to 11px, 10px to 12px, 11px to 13px, and key 12px text (buttons, table names, inputs, hints) to 13px. Field errors are 13px.
- **Comfortable taps (#2).** On phones and touch screens, buttons, inputs, chips and tabs are at least 44px and icon buttons are 44×44. Form text is 16px there, so iPhones don't zoom in when you type.
- **Plain words (#3, #10).** "Read-only access", "planning editor", "module", "workspace", "synthetic" and "edit access" are replaced in visible text and error messages. For example: "You can view this but not change it. Ask the couple if you need something changed." Sign-up and setup are reworded ("New here?", "Tell us about your wedding").
- **Forgot password (#8).** `/forgot-password` emails a reset link (same reply whether or not the email has an account). The link returns through `/auth/callback?next=/reset-password` to `/reset-password`, where you choose a new password. `/auth/confirm` also accepts token-hash links, for use if the Supabase email template is switched (see deploy-vercel.md). Expired links say so in plain words.
- **Sign-up hints (#9).** A password hint under the field, and a "Check your email" screen after creating an account. Signing in before confirming says "Please confirm your email first" instead of "wrong password". Emails typed with a trailing space (common on phones) are now accepted.
- **Move all dates (#15).** Functions → "Move all dates": pick a new date for the first function (or "Same dates next year"); every dated function moves by the same number of days, with a preview of old and new dates. Times stay the same and the database recomputes start and end in the wedding's time zone. If any update fails, the ones already moved are put back. Run-sheet times and task due dates don't move.
- **Payment form (#28).** "Submission key" is now hidden (it still prevents double-recording). "Linked due item" was a free-text box expecting an ID; it is now a list of that booking's instalments. "Convert unbooked estimate" reads "Replaces an earlier estimate?", and "Signed adjustment (+ or −)" reads "Amount" with a plain hint about the minus sign.

### Phase 2A: money, done (2026-11-11)
Phase 2 is split into three slices, each its own commit: **2A Money** (vendors and budget), **2B Plan** (tasks and decisions), **2C Home and menu**.
- **Vendor cards (#21).** Each card shows the latest quote, the contact and how many files it has, with **Call** and **WhatsApp** buttons (10-digit numbers are treated as Indian; opening WhatsApp only starts a chat, nothing is sent).
- **Indian categories (#22).** The category box suggests Caterer, Decorator, Pandit / purohit, Mehendi artist, Nadaswaram / band and others (`src/lib/planning/vendor-rules.ts`). Any category can still be typed.
- **Venue details folded away (#23)** on the card and in the editor.
- **Booked, then budget (#24).** A vendor marked Booked or Selected with no booking shows "Booked, but not in your budget yet" with the latest quote filled in and an **Add to budget** button. The whole price counts for the wedding as a whole.
- **Budget headline (#25).** Budget, Booked and Still to pay, with "Paid so far" and what's left of the budget after everything booked and estimated (or how far over it is).
- **Who we still owe (#26).** Every booking with money left, overdue instalments first. **Mark paid** records the next instalment (or the whole balance) on a chosen date after a confirm step, with a duplicate-safe key. Overdue instalments are now included (the Home count still uses upcoming ones only).
- **Two buttons (#27).** "Add a cost" (booked with an agreed price, or just an estimate) and "Record a payment" open short forms. Splitting a price across functions is optional. Cancellations, instalment schedules, budget split, other expected costs and paying people back are under "More".
- **Files on vendors (#42) and one-step uploads (#43).** Each vendor's details list its files with an **Add a file** button that uploads straight away. On Documents, choosing a file uploads it once you've picked what it belongs to; title and label are optional.

### Phase 2B: plan, done (2026-11-12)
- **One-line add (#17).** A box at the top of Tasks: type a task, optionally pick a date, press Enter. Everything else can be added with Edit.
- **Fewer fields (#18).** The task form shows the task, due date, who's doing it and status; notes, function, priority, "waiting for another task" and vendor/booking notes are under "More details". Plain status words: To do, Started, Stuck, Done, Not needed.
- **Done button** on each open task (no more tick-then-bulk-action); "Select several" still marks many done at once.
- **Starter checklist by months before (#19).** Tasks are grouped by when they're due by default: Overdue, then each month labelled with how far it is from the wedding (for example "March 2027 · 9 months before the wedding"), then No due date, then Done (folded). The usual 14-task checklist is offered on Tasks with tick boxes, its lead time and due date; "Add more of the usual tasks" offers the rest later. Home still adds the whole list in one go.
- **Decisions under Tasks (#20).** One menu entry, Tasks, with **To do** and **To decide** tabs (the same way Guests and Wedding week work). The decisions data and links are unchanged; only the menu and wording moved.
- The workspace now carries the wedding date, so pages can count back from it.

### Phase 2C: Home and menu, done (2026-11-12)
- **Five-item menu (#4):** Home, Plan, Guests, Money, Wedding week. Each opens an area with tabs: Plan (To do, To decide, Functions), Guests (People & RSVPs, Invitations, Messages), Money (Vendors, Budget), Wedding week (Run sheets, Day-of, Catering, Stays & travel). Phone tabs: Home, Plan, Guests, Money, More. "All files" moved to the account menu.
- **"+ Add" (#5)** in the top bar: Task, Family, Guest, Venue or vendor, Cost, Payment, Function, File. Each opens the right form on its page (for example `/budget?add=cost`). Helpers only see what they can change; the server still checks every save.
- **Search (#6):** a box in the top bar (a search icon on phones) opens `/search`, which looks up families, guests, vendors, tasks, decisions, functions and files by name, in the areas you can see. The term is cleaned to letters, numbers and a few name characters before it reaches the database. Results open the list filtered by the term, or jump to the record.
- **First-visit line (#7)** on every menu page: one sentence on what the page is for, with "Got it" (remembered on that device).
- **Simpler Home (#11–13):** countdown and next function, "What needs you today", the setup checklist until it's done, and "How it's going": one line each for tasks, money and guests. The detailed cards, CSV export and print are under "Everything at a glance".
- **Functions as a timeline (#16):** grouped by day with time, place, guests and dress code, undated functions last.

## Soft look (2026-11-08)

An optional soft (neumorphism-inspired) look for the planning workspace. Turn it on from the initials menu, top right: **Soft look**. It's off by default and remembered per device by a cookie, read on the server so there's no flash.

- **Why a hybrid:** full neumorphism makes card and input edges about 1.3:1 against their background and fails the 3:1 minimum, so forms are hard to read.
- **Raised or pressed:** cards, sidebar, choice cards, active menu item and tabs. Primary buttons stay solid; inputs and secondary buttons keep a real border; tables stay flat.
- **Colours** come from `softPalette()` in `src/lib/soft-look.ts`, tinted by the invitation theme. Tests check helper text at 4.5:1 or better and control edges at 3:1 or better for every theme and extreme custom accents.
- **Not affected:** the guest page (including the studio's phone preview), invitation cards, PDFs and printouts (the styles apply on screen only).
