import "server-only";
import { authorizeWeddingOperation, type WeddingModule, type WorkspaceContext } from "@/lib/auth/access";
import { listWeddingFunctions } from "@/lib/data/functions";
import { listWeddingTasks } from "@/lib/data/tasks";
import { listWeddingDecisions } from "@/lib/data/decisions";
import { listWeddingSuppliers } from "@/lib/data/suppliers";
import { getFinanceDashboard } from "@/lib/data/finance";
import { getGuestWorkspace } from "@/lib/data/guests";
import { getCateringWorkspace } from "@/lib/data/catering";
import { getTravelWorkspace } from "@/lib/data/travel";
import { getOperationsWorkspace } from "@/lib/data/operations";
import { cateringReviewReasons } from "@/lib/planning/catering";
import { expiringSupplierItems, paymentsDueSoon, taskCounts, upcomingFunctions } from "@/lib/planning/dashboard";
import { instantToLocalDate } from "@/lib/planning/local-time";
import { sortIssues, unresolvedIssueCounts } from "@/lib/planning/operations-rules";
import { travelGapCounts } from "@/lib/planning/travel-rules";

/** A section either loaded, is outside the member's permissions, or failed. Failures never fall back to sample data. */
export type Section<T> = { state: "ok"; data: T } | { state: "forbidden" } | { state: "error" };

function canRead(context: WorkspaceContext, module: WeddingModule) {
  return context.membership.role === "owner" || context.membership.role === "co_owner" || Boolean(context.moduleAccess[module]);
}

async function section<T>(context: WorkspaceContext, module: WeddingModule, load: () => Promise<T>): Promise<Section<T>> {
  if (!canRead(context, module)) return { state: "forbidden" };
  try {
    return { state: "ok", data: await load() };
  } catch (error) {
    console.error("Dashboard section failed", module, error instanceof Error ? error.name : "unknown");
    return { state: "error" };
  }
}

export async function getDashboard(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId);
  const today = instantToLocalDate(new Date(), context.wedding.timezone);
  const userId = context.user.id;
  const [functions, tasks, decisions, suppliers, finance, rsvp, catering, travel, issues] = await Promise.all([
    section(context, "planning", async () => {
      const rows = await listWeddingFunctions(weddingId);
      return { total: rows.filter((fn) => !fn.archived_at).length, upcoming: upcomingFunctions(rows, today) };
    }),
    section(context, "planning", async () => {
      const rows = await listWeddingTasks(weddingId);
      const counts = taskCounts(rows, userId, today);
      const mine = rows.filter((task) => task.owner_user_id === userId && task.status !== "completed" && task.status !== "cancelled")
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).slice(0, 5);
      return { ...counts, total: rows.length, mine: mine.map((task) => ({ id: task.id, title: task.title, due_date: task.due_date, overdue: Boolean(task.due_date && task.due_date < today) })) };
    }),
    section(context, "planning", async () => {
      const rows = await listWeddingDecisions(weddingId);
      const open = rows.filter((decision) => decision.status === "open");
      return { open: open.length, items: open.slice(0, 5).map((decision) => ({ id: decision.id, question: decision.question })) };
    }),
    section(context, "suppliers_finance", async () => {
      const { suppliers: rows } = await listWeddingSuppliers(weddingId);
      return { items: expiringSupplierItems(rows, today) };
    }),
    section(context, "suppliers_finance", async () => {
      const data = await getFinanceDashboard(weddingId);
      const due = paymentsDueSoon(data.obligations as unknown as Array<{ id: string; label: string; booking_label: string; due_date: string; remaining: string; currency: string }>, today);
      return { totals: data.totals, due: due.map((row) => ({ id: row.id, label: row.label, booking: row.booking_label, due_date: row.due_date, remaining: row.remaining, currency: row.currency })) };
    }),
    section(context, "guests", async () => {
      const data = await getGuestWorkspace(weddingId);
      return { guests: data.guests.length, functions: data.functionSummaries.map((fn) => ({ id: fn.id, name: fn.name, date: fn.date, invited: fn.invited, yes: fn.yes, no: fn.no, maybe: fn.maybe, pending: fn.pending })) };
    }),
    section(context, "logistics", async () => {
      const data = await getCateringWorkspace(weddingId);
      const flagged = data.services.map((service) => ({
        id: service.id, name: service.name, function_name: data.functions.find((fn) => fn.id === service.function_id)?.name ?? "Function",
        reasons: cateringReviewReasons({
          guests: service.guests, assignedGuestIds: new Set(service.assignments.map((row: { guest_id: string }) => row.guest_id)),
          latestSnapshotConfirmed: service.latest_snapshot?.confirmed_count ?? null, finalCountDeadline: service.final_count_deadline, hasSnapshot: Boolean(service.latest_snapshot),
        }),
      })).filter((row) => row.reasons.length);
      return { services: data.services.length, flagged };
    }),
    section(context, "logistics", async () => {
      const data = await getTravelWorkspace(weddingId);
      return travelGapCounts(data.states);
    }),
    section(context, "logistics", async () => {
      const data = await getOperationsWorkspace(weddingId);
      const open = sortIssues(data.issues).filter((issue) => issue.status !== "resolved");
      return { ...unresolvedIssueCounts(data.issues), items: open.slice(0, 5).map((issue) => ({ id: issue.id, title: issue.title, severity: issue.severity })) };
    }),
  ]);
  return {
    wedding: context.wedding,
    displayName: context.displayName,
    isOwner: context.membership.role === "owner" || context.membership.role === "co_owner",
    today,
    generatedAt: new Date().toISOString(),
    functions, tasks, decisions, suppliers, finance, rsvp, catering, travel, issues,
  };
}
export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/** Flat metric rows for CSV export. Only sections the member can read and that loaded are included. */
export function dashboardRows(dashboard: Dashboard) {
  const rows: Array<{ section: string; metric: string; value: string; link: string }> = [];
  const add = (section: string, metric: string, value: string | number, link: string) => rows.push({ section, metric, value: String(value), link });
  if (dashboard.functions.state === "ok") for (const fn of dashboard.functions.data.upcoming) add("Upcoming functions", fn.name, fn.function_date ?? "", "/functions");
  if (dashboard.tasks.state === "ok") {
    add("Tasks", "My open tasks", dashboard.tasks.data.mineOpen, "/tasks?view=mine-open");
    add("Tasks", "My overdue tasks", dashboard.tasks.data.mineOverdue, "/tasks?view=mine-overdue");
    add("Tasks", "All overdue tasks", dashboard.tasks.data.overdue, "/tasks?view=overdue");
  }
  if (dashboard.decisions.state === "ok") add("Decisions", "Awaiting a decision", dashboard.decisions.data.open, "/decisions?status=open");
  if (dashboard.suppliers.state === "ok") add("Venues & vendors", "Vendors with holds or quotes expiring in 14 days", new Set(dashboard.suppliers.data.items.map((item) => item.supplierId)).size, "/venues-vendors?filter=expiring");
  if (dashboard.finance.state === "ok") {
    add("Budget", "Payments due in 30 days", dashboard.finance.data.due.length, "/budget?due=30#upcoming-payments");
    for (const total of dashboard.finance.data.totals) {
      add("Budget", `Budget (${total.currency})`, total.budget ?? "Not set", "/budget");
      add("Budget", `Forecast (${total.currency})`, total.forecast, "/budget");
      add("Budget", `Committed (${total.currency})`, total.committed, "/budget");
      add("Budget", `Net paid (${total.currency})`, total.netPaid, "/budget");
      add("Budget", `Outstanding (${total.currency})`, total.outstanding, "/budget");
    }
  }
  if (dashboard.rsvp.state === "ok") for (const fn of dashboard.rsvp.data.functions) add("RSVPs", `${fn.name}: yes / no / maybe / awaiting of invited`, `${fn.yes} / ${fn.no} / ${fn.maybe} / ${fn.pending} of ${fn.invited}`, `/guests?view=invitations&function=${fn.id}`);
  if (dashboard.catering.state === "ok") add("Catering", "Meal services needing review", dashboard.catering.data.flagged.length, "/logistics");
  if (dashboard.travel.state === "ok") {
    add("Stays & transport", "Need a room, not assigned", dashboard.travel.data.roomsNotAssigned, "/travel?tab=needs&filter=rooms-missing");
    add("Stays & transport", "Need arrival transport, not assigned", dashboard.travel.data.arrivalsNotAssigned, "/travel?tab=needs&filter=arrivals-missing");
    add("Stays & transport", "Need departure transport, not assigned", dashboard.travel.data.departuresNotAssigned, "/travel?tab=needs&filter=departures-missing");
  }
  if (dashboard.issues.state === "ok") add("Wedding day", "Unresolved issues", dashboard.issues.data.total, "/schedule?tab=issues");
  return rows;
}
