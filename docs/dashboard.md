# Dashboard (Overview)

**Route:** `/overview`. **Export:** `/overview/export` (CSV). No migration.

The overview now uses only this wedding's records. The synthetic demo panels and the “sample data” banner are removed from this page.

## Sections and where each number comes from

| Section | Module | Source loader → shared rule | Links to |
| --- | --- | --- | --- |
| Upcoming functions | planning | `listWeddingFunctions` → `upcomingFunctions` | `/functions` |
| My / overdue / due-soon tasks | planning | `listWeddingTasks` → `taskCounts` (uses `isTaskOverdue`, `isTaskDueSoon`) | `/tasks?view=mine\|overdue\|due-soon` |
| Decisions awaiting action | planning | `listWeddingDecisions` (status `open`) | `/decisions?status=open` |
| Expiring holds and quotes (14 days) | suppliers_finance | `listWeddingSuppliers` → `expiringSupplierItems` | `/venues-vendors?filter=expiring` |
| Budget, forecast, payments due (30 days) | suppliers_finance | `getFinanceDashboard` (same totals as Budget) → `paymentsDueSoon` | `/budget`, `/budget#upcoming-payments` |
| RSVP progress by function | guests | `getGuestWorkspace().functionSummaries` | `/guests?view=invitations&function=<id>` |
| Catering needing review | logistics | `getCateringWorkspace` → `cateringReviewReasons` (also used by the Catering page) | `/logistics#service-<id>` |
| Guests missing rooms/transport | logistics | `getTravelWorkspace` → `travelGapCounts` | `/travel?tab=needs&filter=…` |
| Unresolved wedding-day issues | logistics | `getOperationsWorkspace` → `unresolvedIssueCounts` | `/schedule?tab=issues` |

The dashboard calls each module's own loader and rule, so its numbers are the ones the linked page shows. The pages now accept these URL filters (tasks `view`, decisions `status`, venues `filter=expiring`, guests `view`/`function`/`response`).

## States

- **Permission:** a section is only loaded if the member can read its module. Hidden sections are not queried, and a note says some areas are hidden.
- **Failure:** a failed section shows “could not load — no figures are shown instead of the real ones”. Demo values are never substituted.
- **Loading:** the workspace `loading.tsx` skeleton covers the server render.
- **Last updated:** the heading shows the generation time in the wedding timezone. The CSV includes a “Generated at (UTC)” row.
- **New wedding:** with no functions, guests or tasks, a “Getting started” checklist links to settings, functions, guests, venues and tasks.

## Exports and printing

- **Export CSV** includes only sections the member can read that loaded successfully. Cells are protected against spreadsheet formula injection, and responses are `no-store`.
- **Print summary** prints the dashboard cards without navigation.

## Tests

`tests/dashboard.test.ts` checks window boundaries (today and horizon inclusive, expired excluded), that a shared booking split across two functions is counted once, and that finance totals, travel gaps, open issues and overdue tasks equal independent SQL aggregates over the same records.
