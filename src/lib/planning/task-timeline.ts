/**
 * Groups tasks by when they're due: overdue first, then one group per calendar month
 * (labelled with how many months before the wedding that is), then undated, then done.
 */

export type TimelineTask = { id: string; due_date: string | null; status: string; title: string };
export type TimelineGroup<T> = { key: string; label: string; hint: string | null; tasks: T[]; done?: boolean };

const finished = (status: string) => status === "completed" || status === "cancelled";

const monthIndex = (date: string) => { const [year, month] = date.split("-").map(Number); return year * 12 + (month - 1); };

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 15)));
}

/** "12 months before the wedding", "The wedding month", or null without a date. */
export function monthsBeforeLabel(monthKey: string, weddingDate: string | null): string | null {
  if (!weddingDate) return null;
  const gap = monthIndex(weddingDate) - monthIndex(`${monthKey}-01`);
  if (gap === 0) return "The wedding month";
  if (gap < 0) return `${-gap} month${gap === -1 ? "" : "s"} after the wedding`;
  return `${gap} month${gap === 1 ? "" : "s"} before the wedding`;
}

export function groupTasksByWhen<T extends TimelineTask>(tasks: T[], today: string, weddingDate: string | null): TimelineGroup<T>[] {
  const byDue = (a: T, b: T) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.title.localeCompare(b.title);
  const open = tasks.filter((task) => !finished(task.status));
  const groups: TimelineGroup<T>[] = [];
  const overdue = open.filter((task) => task.due_date && task.due_date < today).sort(byDue);
  if (overdue.length) groups.push({ key: "overdue", label: "Overdue", hint: null, tasks: overdue });
  const months = new Map<string, T[]>();
  for (const task of open.filter((item) => item.due_date && item.due_date >= today).sort(byDue)) {
    const key = (task.due_date as string).slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), task]);
  }
  const thisMonth = today.slice(0, 7);
  for (const [key, rows] of months) groups.push({ key, label: key === thisMonth ? `This month · ${monthLabel(key)}` : monthLabel(key), hint: monthsBeforeLabel(key, weddingDate), tasks: rows });
  const undated = open.filter((task) => !task.due_date).sort(byDue);
  if (undated.length) groups.push({ key: "undated", label: "No due date", hint: null, tasks: undated });
  const done = tasks.filter((task) => finished(task.status)).sort(byDue);
  if (done.length) groups.push({ key: "done", label: "Done", hint: null, tasks: done, done: true });
  return groups;
}
