/**
 * Dashboard selections. Each helper reuses a module's own rule so dashboard numbers always
 * match the page they link to.
 */
import { matchesTaskView } from "@/lib/planning/task-rules";

export function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

export function taskCounts(tasks: Array<{ owner_user_id: string | null; due_date: string | null; status: string }>, userId: string, today: string) {
  const count = (view: Parameters<typeof matchesTaskView>[1]) => tasks.filter((task) => matchesTaskView(task, view, userId, today)).length;
  return { mineOpen: count("mine-open"), mineOverdue: count("mine-overdue"), overdue: count("overdue"), dueSoon: count("due-soon") };
}

/** Upcoming = not archived, not cancelled, dated today or later (wedding-local date). */
export function upcomingFunctions<T extends { function_date: string | null; status: string; archived_at?: string | null }>(functions: T[], today: string, limit = 5): T[] {
  return functions.filter((fn) => !fn.archived_at && fn.status !== "cancelled" && fn.function_date && fn.function_date >= today)
    .sort((a, b) => a.function_date!.localeCompare(b.function_date!)).slice(0, limit);
}

export type ExpiringItem = { supplierId: string; supplierName: string; kind: "hold" | "quote"; date: string; label: string };

/** Venue holds and quotes expiring from today up to the horizon (inclusive). Expired ones are not "expiring". */
export function expiringSupplierItems(suppliers: Array<{
  id: string; name: string; status: string;
  requested_dates: Array<{ requested_date: string; hold_expires_on: string | null; availability_status: string }>;
  quotes: Array<{ version_number: number; expires_on: string | null }>;
}>, today: string, horizonDays = 14): ExpiringItem[] {
  const until = addDaysIso(today, horizonDays);
  const inWindow = (date: string | null) => Boolean(date && date >= today && date <= until);
  const items: ExpiringItem[] = [];
  for (const supplier of suppliers) {
    if (supplier.status === "rejected" || supplier.status === "archived") continue;
    for (const hold of supplier.requested_dates) if (hold.availability_status !== "unavailable" && inWindow(hold.hold_expires_on)) items.push({ supplierId: supplier.id, supplierName: supplier.name, kind: "hold", date: hold.hold_expires_on!, label: `Hold for ${hold.requested_date}` });
    for (const quote of supplier.quotes) if (inWindow(quote.expires_on)) items.push({ supplierId: supplier.id, supplierName: supplier.name, kind: "quote", date: quote.expires_on!, label: `Quote v${quote.version_number}` });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function supplierIdsWithExpiringItems(...args: Parameters<typeof expiringSupplierItems>) {
  return new Set(expiringSupplierItems(...args).map((item) => item.supplierId));
}

/** Scheduled payments with money still due, from today up to the horizon. */
export function paymentsDueSoon<T extends { due_date: string; remaining: string }>(obligations: T[], today: string, horizonDays = 30): T[] {
  const until = addDaysIso(today, horizonDays);
  return obligations.filter((row) => row.due_date >= today && row.due_date <= until && row.remaining !== "0.00");
}
