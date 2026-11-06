/**
 * One status vocabulary for people, whatever the record type:
 * Idea → Planned → In progress → Confirmed → Done, or Cancelled.
 * Each record keeps its precise database status; this only controls what is shown, plus a short note
 * where the precise status adds something ("Booked", "Running late", "Driver assigned").
 */
export type Stage = "idea" | "planned" | "in_progress" | "confirmed" | "done" | "cancelled";
export type RecordKind = "function" | "task" | "decision" | "supplier" | "booking" | "stay" | "journey" | "schedule" | "arrangement" | "issue";

export const STAGE_LABELS: Record<Stage, string> = { idea: "Idea", planned: "Planned", in_progress: "In progress", confirmed: "Confirmed", done: "Done", cancelled: "Cancelled" };
export const STAGE_HELP: Record<Stage, string> = {
  idea: "Being explored. Nothing is agreed.",
  planned: "Intended, but not yet agreed with anyone.",
  in_progress: "Underway.",
  confirmed: "Agreed or booked.",
  done: "Finished.",
  cancelled: "No longer happening. Kept for history.",
};

const MAP: Record<RecordKind, Record<string, { stage: Stage; note?: string }>> = {
  function: { tentative: { stage: "planned" }, confirmed: { stage: "confirmed" }, cancelled: { stage: "cancelled" } },
  task: { not_started: { stage: "planned" }, in_progress: { stage: "in_progress" }, blocked: { stage: "in_progress", note: "Blocked" }, completed: { stage: "done" }, cancelled: { stage: "cancelled" } },
  decision: { open: { stage: "idea", note: "To decide" }, deferred: { stage: "planned", note: "Later" }, decided: { stage: "done", note: "Decided" } },
  supplier: {
    researching: { stage: "idea" }, contacted: { stage: "idea", note: "Contacted" }, visit_planned: { stage: "planned", note: "Visit planned" }, shortlisted: { stage: "planned", note: "Shortlisted" },
    selected: { stage: "confirmed", note: "Chosen" }, booked: { stage: "confirmed", note: "Booked" }, rejected: { stage: "cancelled", note: "Not chosen" }, archived: { stage: "cancelled", note: "Archived" },
  },
  booking: { tentative: { stage: "planned" }, confirmed: { stage: "confirmed" }, cancelled: { stage: "cancelled" } },
  stay: { proposed: { stage: "planned" }, confirmed: { stage: "confirmed" }, cancelled: { stage: "cancelled" } },
  journey: { planned: { stage: "planned" }, assigned: { stage: "confirmed", note: "Driver assigned" }, collected: { stage: "in_progress", note: "On the way" }, completed: { stage: "done" }, cancelled: { stage: "cancelled" } },
  schedule: { planned: { stage: "planned" }, confirmed: { stage: "confirmed" }, in_progress: { stage: "in_progress" }, delayed: { stage: "in_progress", note: "Running late" }, done: { stage: "done" }, cancelled: { stage: "cancelled" } },
  arrangement: { not_started: { stage: "planned" }, in_progress: { stage: "in_progress" }, ready: { stage: "confirmed", note: "Ready" }, done: { stage: "done" }, cancelled: { stage: "cancelled" } },
  issue: { open: { stage: "planned", note: "Open" }, in_progress: { stage: "in_progress" }, resolved: { stage: "done", note: "Resolved" } },
};

export function describeStatus(kind: RecordKind, status: string): { stage: Stage; label: string; note?: string; text: string } {
  const entry = MAP[kind][status] ?? { stage: "planned" as Stage, note: status.replace(/_/g, " ") };
  const label = STAGE_LABELS[entry.stage];
  return { stage: entry.stage, label, note: entry.note, text: entry.note ? `${label} · ${entry.note}` : label };
}

/** Options for a status <select>, labelled in the shared vocabulary but saving the precise value. */
export function statusOptions(kind: RecordKind): Array<{ value: string; label: string }> {
  return Object.keys(MAP[kind]).map((value) => ({ value, label: describeStatus(kind, value).text }));
}
