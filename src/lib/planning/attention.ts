/**
 * "What needs you today": the few most urgent things across the wedding, each with one action.
 * Built only from dashboard sections the member can read and that loaded successfully.
 */
import { addDaysIso } from "@/lib/planning/dashboard";

export type AttentionItem = { id: string; tone: "alert" | "warn" | "info"; title: string; detail: string; href: string; action: string };

export type AttentionInput = {
  today: string;
  tasks?: { mineOverdue: number; overdue: number };
  decisions?: { open: number };
  suppliers?: { items: Array<{ supplierId: string; supplierName: string; kind: "hold" | "quote"; date: string }> };
  payments?: Array<{ due_date: string; booking: string; remaining: string; currency: string }>;
  rsvp?: Array<{ id: string; name: string; date: string | null; pending: number }>;
  catering?: { flagged: Array<{ id: string; name: string; function_name: string }> };
  travel?: { roomsNotAssigned: number; arrivalsNotAssigned: number; departuresNotAssigned: number };
  issues?: { total: number; critical: number };
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function attentionItems(input: AttentionInput, limit = 7): AttentionItem[] {
  const items: AttentionItem[] = [];
  const week = addDaysIso(input.today, 7);
  if (input.issues?.critical) items.push({ id: "issues-critical", tone: "alert", title: `${plural(input.issues.critical, "critical wedding-day issue")} open`, detail: "These need an owner and a fix first.", href: "/schedule?tab=issues", action: "Review issues" });
  if (input.tasks?.mineOverdue) items.push({ id: "tasks-mine-overdue", tone: "alert", title: `${plural(input.tasks.mineOverdue, "of your tasks is", "of your tasks are")} overdue`, detail: "Finish them or move the due date.", href: "/tasks?view=mine-overdue", action: "Open my tasks" });
  const paymentsThisWeek = (input.payments ?? []).filter((row) => row.due_date >= input.today && row.due_date <= week);
  if (paymentsThisWeek.length) items.push({ id: "payments-week", tone: "warn", title: `${plural(paymentsThisWeek.length, "payment")} due this week`, detail: paymentsThisWeek.slice(0, 2).map((row) => row.booking).join(", ") + (paymentsThisWeek.length > 2 ? "…" : ""), href: "/budget?due=7#upcoming-payments", action: "See payments" });
  const expiringThisWeek = (input.suppliers?.items ?? []).filter((item) => item.date <= week);
  if (expiringThisWeek.length) {
    const vendors = [...new Set(expiringThisWeek.map((item) => item.supplierName))];
    items.push({ id: "suppliers-week", tone: "warn", title: vendors.length === 1 ? "1 vendor hold or quote expires this week" : `${vendors.length} vendors have holds or quotes expiring this week`, detail: vendors.slice(0, 3).join(", "), href: "/venues-vendors?filter=expiring", action: "Decide or extend" });
  }
  const soon = addDaysIso(input.today, 14);
  for (const fn of (input.rsvp ?? []).filter((row) => row.pending > 0 && row.date && row.date >= input.today && row.date <= soon)) {
    items.push({ id: `rsvp-${fn.id}`, tone: "warn", title: `${plural(fn.pending, "guest hasn't", "guests haven't")} replied for ${fn.name}`, detail: "It is less than two weeks away.", href: `/messages?function=${fn.id}&kind=reminder`, action: "Send reminders" });
  }
  if (input.catering?.flagged.length) items.push({ id: "catering", tone: "warn", title: `${plural(input.catering.flagged.length, "meal service needs", "meal services need")} a catering review`, detail: input.catering.flagged.slice(0, 2).map((row) => `${row.function_name} · ${row.name}`).join(", "), href: `/logistics#service-${input.catering.flagged[0]!.id}`, action: "Review counts" });
  const travelGaps = (input.travel?.roomsNotAssigned ?? 0) + (input.travel?.arrivalsNotAssigned ?? 0) + (input.travel?.departuresNotAssigned ?? 0);
  if (travelGaps) items.push({ id: "travel", tone: "warn", title: `${plural(travelGaps, "room or ride", "rooms or rides")} still to arrange`, detail: "Guests who need them have nothing allocated yet.", href: input.travel!.roomsNotAssigned ? "/travel?tab=needs&filter=rooms-missing" : input.travel!.arrivalsNotAssigned ? "/travel?tab=needs&filter=arrivals-missing" : "/travel?tab=needs&filter=departures-missing", action: "Arrange" });
  if (input.decisions?.open) items.push({ id: "decisions", tone: "info", title: `${plural(input.decisions.open, "decision is", "decisions are")} waiting`, detail: "Compare the options and choose together.", href: "/decisions?status=open", action: "Decide" });
  if (input.issues && input.issues.total > input.issues.critical) items.push({ id: "issues-other", tone: "info", title: `${plural(input.issues.total - input.issues.critical, "other open issue")}`, detail: "Not critical, but still unresolved.", href: "/schedule?tab=issues", action: "Review" });
  return items.slice(0, limit);
}
