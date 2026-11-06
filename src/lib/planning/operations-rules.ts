/**
 * Wedding-day operations rules: schedule warnings, delay impact and issue ordering.
 * Nothing here moves a schedule. A late item only produces warnings for items that may be affected.
 */
import { intervalsOverlap } from "@/lib/planning/travel-rules";

export type ScheduleStatus = "planned" | "confirmed" | "in_progress" | "delayed" | "done" | "cancelled";
export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "in_progress" | "resolved";
export type ArrangementCategory = "decor" | "outfit" | "ceremony_materials" | "gifts_hampers" | "photography" | "music_performance" | "other";
export type ArrangementStatus = "not_started" | "in_progress" | "ready" | "done" | "cancelled";

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = { planned: "Planned", confirmed: "Confirmed", in_progress: "In progress", delayed: "Delayed", done: "Done", cancelled: "Cancelled" };
export const SEVERITY_LABELS: Record<IssueSeverity, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };
export const ARRANGEMENT_LABELS: Record<ArrangementCategory, string> = {
  decor: "Decor & approved designs", outfit: "Outfits & fittings", ceremony_materials: "Ceremony materials", gifts_hampers: "Gifts & welcome hampers",
  photography: "Photography shot lists", music_performance: "Music & performances", other: "Other",
};
export const ARRANGEMENT_STATUS_LABELS: Record<ArrangementStatus, string> = { not_started: "Not started", in_progress: "In progress", ready: "Ready", done: "Done", cancelled: "Cancelled" };

export type ScheduleItemForRules = {
  id: string; function_id: string; activity: string; location: string;
  planned_start: string; planned_end: string; actual_start: string | null; actual_end: string | null;
  owner_user_id: string | null; owner_name: string; vendor_arrival_at: string | null; status: ScheduleStatus;
};
export type ScheduleDependency = { item_id: string; depends_on_item_id: string };
export type ScheduleWarning = { itemId: string; kind: "owner_overlap" | "location_overlap" | "dependency_order" | "vendor_late" | "outside_function" | "delay_impact"; message: string };

const active = (item: ScheduleItemForRules) => item.status !== "cancelled";
/** Owners are matched by member id, or by a case- and space-insensitive name for non-members. */
export function ownerKey(item: Pick<ScheduleItemForRules, "owner_user_id" | "owner_name">) {
  if (item.owner_user_id) return `member:${item.owner_user_id}`;
  const name = item.owner_name.trim().toLowerCase().replace(/\s+/g, " ");
  return name ? `name:${name}` : null;
}

/** Minutes an item started or is running late; null when on time or not started late. */
export function minutesLate(item: Pick<ScheduleItemForRules, "planned_start" | "actual_start" | "status">, now = new Date()): number | null {
  const planned = new Date(item.planned_start).getTime();
  if (item.actual_start) {
    const late = Math.round((new Date(item.actual_start).getTime() - planned) / 60_000);
    return late > 0 ? late : null;
  }
  if (item.status === "delayed") return Math.max(0, Math.round((now.getTime() - planned) / 60_000)) || null;
  return null;
}

/** Items that depend (directly or transitively) on the given item. */
export function downstreamItems(itemId: string, dependencies: ScheduleDependency[]): string[] {
  const result = new Set<string>();
  const queue = [itemId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const dependency of dependencies) {
      if (dependency.depends_on_item_id === current && !result.has(dependency.item_id) && dependency.item_id !== itemId) {
        result.add(dependency.item_id); queue.push(dependency.item_id);
      }
    }
  }
  return [...result];
}

export function scheduleWarnings(input: {
  items: ScheduleItemForRules[];
  dependencies: ScheduleDependency[];
  functionWindows?: Map<string, { starts_at: string | null; ends_at: string | null }>;
  ownerLabel?: (key: string) => string;
}): ScheduleWarning[] {
  const items = input.items.filter(active);
  const byId = new Map(items.map((item) => [item.id, item]));
  const warnings: ScheduleWarning[] = [];
  const label = input.ownerLabel ?? ((key: string) => key.replace(/^(member|name):/, ""));
  for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
    const a = items[i]!; const b = items[j]!;
    if (!intervalsOverlap(a.planned_start, a.planned_end, b.planned_start, b.planned_end)) continue;
    const key = ownerKey(a);
    if (key && key === ownerKey(b)) {
      const message = `${label(key)} is responsible for “${a.activity}” and “${b.activity}” at overlapping times.`;
      warnings.push({ itemId: a.id, kind: "owner_overlap", message }, { itemId: b.id, kind: "owner_overlap", message });
    }
    const place = a.location.trim().toLowerCase();
    if (place && place === b.location.trim().toLowerCase()) {
      const message = `“${a.activity}” and “${b.activity}” overlap in ${a.location.trim()}.`;
      warnings.push({ itemId: a.id, kind: "location_overlap", message }, { itemId: b.id, kind: "location_overlap", message });
    }
  }
  for (const dependency of input.dependencies) {
    const item = byId.get(dependency.item_id); const before = byId.get(dependency.depends_on_item_id);
    if (item && before && new Date(item.planned_start) < new Date(before.planned_end)) {
      warnings.push({ itemId: item.id, kind: "dependency_order", message: `Starts before “${before.activity}” is planned to finish.` });
    }
  }
  for (const item of items) {
    if (item.vendor_arrival_at && new Date(item.vendor_arrival_at) > new Date(item.planned_start)) {
      warnings.push({ itemId: item.id, kind: "vendor_late", message: "Vendor arrival is after the planned start; there is no setup time." });
    }
    const window = input.functionWindows?.get(item.function_id);
    if (window?.starts_at && window.ends_at && (new Date(item.planned_start) < new Date(window.starts_at) || new Date(item.planned_end) > new Date(window.ends_at))) {
      warnings.push({ itemId: item.id, kind: "outside_function", message: "Falls outside the function's scheduled time. Setup and pack-up can, but check it is intended." });
    }
    const late = minutesLate(item);
    if (late) {
      for (const affectedId of downstreamItems(item.id, input.dependencies)) {
        const affected = byId.get(affectedId);
        if (affected && affected.status !== "done") warnings.push({ itemId: affectedId, kind: "delay_impact", message: `May be affected: “${item.activity}” is running ${late} min late. The schedule was not moved automatically.` });
      }
    }
  }
  return warnings;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export function sortIssues<T extends { severity: IssueSeverity; status: IssueStatus; created_at: string }>(issues: T[]): T[] {
  return [...issues].sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.created_at.localeCompare(b.created_at));
}

/** Unresolved = open or in progress. Shared with the dashboard. */
export function unresolvedIssueCounts(issues: Array<{ severity: IssueSeverity; status: IssueStatus }>) {
  const open = issues.filter((issue) => issue.status !== "resolved");
  return { total: open.length, critical: open.filter((issue) => issue.severity === "critical").length, high: open.filter((issue) => issue.severity === "high").length };
}

export function checklistProgress(items: Array<{ is_done: boolean }>) {
  return { done: items.filter((item) => item.is_done).length, total: items.length };
}
