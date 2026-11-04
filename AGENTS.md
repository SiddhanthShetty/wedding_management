# Wedding Planning App Working Rules

## Product and delivery

- Build a private wedding-planning web app for a couple, their authorised family members, and invited guests.
- Manage multiple wedding functions; tasks and decisions; venue and vendor shortlists; quotes, bookings, budgets, and payments; guest households and individuals; event-specific invitations and RSVPs; menus, accommodation, transport; wedding-day schedules; documents, reminders, and operational reports.
- Implement only the currently agreed milestone. Prefer a small, complete working vertical slice over many incomplete screens.
- Before implementation, provide a short repository assessment, milestone plan, assumptions, and any genuinely blocking questions.
- Reuse working features, conventions, and data structures. Do not rebuild the project or replace dependencies without explaining why.
- If a required decision is not blocking, choose a reversible default and document it.

## Data, access, and external actions

- Keep demo data clearly labelled and separate from real wedding data.
- Do not invent credentials, vendor data, prices, policies, or successful test results.
- Never expose secrets in browser code, logs, or the repository.
- Enforce access rules on the server or database, not only in the UI.
- Do not send real messages, take payments, deploy, push code, apply remote database changes, or delete existing data without separate approval.
- For schema changes, provide versioned migrations and explain the data impact.

## Quality and reporting

- Make forms accessible and usable on mobile.
- Include loading, empty, validation, permission, and failure states.
- Add automated tests for implemented business rules.
- After implementation, report what changed, affected files and migrations, checks actually run and their results, checks not run and why, exact local verification steps, and known limitations.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
