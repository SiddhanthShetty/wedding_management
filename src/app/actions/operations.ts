"use server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import {
  addChecklistLine, addScheduleDependency, createArrangement, createIssue, createScheduleItem, OperationsConflictError, OperationsRuleError,
  recordScheduleProgress, removeScheduleDependency, setChecklistLine, updateArrangement, updateIssue, updateScheduleItem,
} from "@/lib/data/operations";

export type OperationsActionState = { error?: string; message?: string; at?: number };

const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };
const all = (form: FormData, key: string) => form.getAll(key).filter((value): value is string => typeof value === "string" && value.length > 0);
const id = z.uuid();
const optionalId = z.union([id, z.literal("")]).transform((value) => value || null);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Choose a date and time.");
const optionalLocalDateTime = z.union([localDateTime, z.literal("")]);
const shortText = (max: number) => z.string().trim().max(max);
const version = z.coerce.number().int().positive();
const submissionKey = (form: FormData) => z.union([id, z.literal("")]).transform((value) => value || null).parse(text(form, "submissionKey"));

function failure(error: unknown): OperationsActionState {
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the entered values." };
  if (error instanceof OperationsRuleError || error instanceof OperationsConflictError) return { error: error.message };
  if (error instanceof AuthorizationDeniedError) return { error: "Your logistics edit access is no longer available. Refresh and try again." };
  return { error: "The change could not be saved. Nothing was recorded; refresh and try again." };
}

async function run(form: FormData, message: string, task: (weddingId: string) => Promise<void>): Promise<OperationsActionState> {
  const wedding = id.safeParse(text(form, "weddingId"));
  if (!wedding.success) return { error: "Invalid wedding workspace." };
  try {
    await task(wedding.data);
    revalidatePath("/schedule"); revalidatePath("/overview");
    return { message, at: Date.now() };
  } catch (error) {
    return failure(error);
  }
}

const scheduleSchema = z.object({
  function_id: id, activity: z.string().trim().min(1, "Enter the activity.").max(200), location: shortText(300),
  planned_start: localDateTime, planned_end: localDateTime, actual_start: optionalLocalDateTime, actual_end: optionalLocalDateTime,
  owner_user_id: optionalId, owner_name: shortText(160), backup_contact: shortText(300), supplier_id: optionalId, vendor_arrival_at: optionalLocalDateTime,
  setup_requirements: shortText(2000), packup_requirements: shortText(2000),
  status: z.enum(["planned", "confirmed", "in_progress", "delayed", "done", "cancelled"]), delay_note: shortText(1000), notes: shortText(2000),
}).refine((value) => value.status !== "delayed" || value.delay_note.length > 0, { message: "Add a delay note when marking an item delayed." });
const scheduleFields = (form: FormData) => Object.fromEntries(["function_id", "activity", "location", "planned_start", "planned_end", "actual_start", "actual_end", "owner_user_id", "owner_name", "backup_contact", "supplier_id", "vendor_arrival_at", "setup_requirements", "packup_requirements", "status", "delay_note", "notes"].map((key) => [key, key === "status" ? text(form, key) || "planned" : text(form, key)]));

export async function createScheduleItemAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Schedule item added.", async (weddingId) => {
    await createScheduleItem(weddingId, scheduleSchema.parse(scheduleFields(form)), z.array(id).max(20).parse(all(form, "depends_on")), submissionKey(form));
  });
}

export async function updateScheduleItemAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Schedule item updated. Other items were not moved.", async (weddingId) => {
    await updateScheduleItem(weddingId, id.parse(text(form, "itemId")), version.parse(text(form, "version")), scheduleSchema.parse(scheduleFields(form)));
  });
}

export async function recordScheduleProgressAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  const kind = z.enum(["start", "done", "delay"]).safeParse(text(form, "kind"));
  if (!kind.success) return { error: "Unknown progress update." };
  const message = kind.data === "start" ? "Marked as started now." : kind.data === "done" ? "Marked as done now." : "Delay recorded. Later items were not moved; review the warnings.";
  return run(form, message, async (weddingId) => {
    const note = shortText(1000).parse(text(form, "delay_note"));
    if (kind.data === "delay" && !note) throw new OperationsRuleError("Describe the delay so others know what happened.");
    await recordScheduleProgress(weddingId, id.parse(text(form, "itemId")), version.parse(text(form, "version")), { kind: kind.data, delay_note: note });
  });
}

export async function addScheduleDependencyAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Dependency added.", async (weddingId) => { await addScheduleDependency(weddingId, id.parse(text(form, "itemId")), id.parse(text(form, "dependsOn"))); });
}

export async function removeScheduleDependencyAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Dependency removed.", async (weddingId) => { await removeScheduleDependency(weddingId, id.parse(text(form, "itemId")), id.parse(text(form, "dependsOn"))); });
}

const severity = z.enum(["low", "medium", "high", "critical"]);
export async function createIssueAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Issue logged.", async (weddingId) => {
    await createIssue(weddingId, z.object({ function_id: optionalId, schedule_item_id: optionalId, title: z.string().trim().min(1, "Describe the issue.").max(200), details: shortText(4000), severity, owner_user_id: optionalId, owner_name: shortText(160) })
      .parse({ function_id: text(form, "function_id"), schedule_item_id: text(form, "schedule_item_id"), title: text(form, "title"), details: text(form, "details"), severity: text(form, "severity") || "medium", owner_user_id: text(form, "owner_user_id"), owner_name: text(form, "owner_name") }), submissionKey(form));
  });
}

export async function updateIssueAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Issue updated.", async (weddingId) => {
    const parsed = z.object({ issueId: id, version, status: z.enum(["open", "in_progress", "resolved"]), severity, owner_user_id: optionalId, owner_name: shortText(160), resolution_note: shortText(2000) })
      .refine((value) => value.status !== "resolved" || value.resolution_note.length > 0, { message: "Add a short resolution note before resolving." })
      .parse({ issueId: text(form, "issueId"), version: text(form, "version"), status: text(form, "status"), severity: text(form, "severity"), owner_user_id: text(form, "owner_user_id"), owner_name: text(form, "owner_name"), resolution_note: text(form, "resolution_note") });
    const { issueId, version: expected, ...values } = parsed;
    await updateIssue(weddingId, issueId, expected, values);
  });
}

const arrangementSchema = z.object({
  function_id: optionalId, category: z.enum(["decor", "outfit", "ceremony_materials", "gifts_hampers", "photography", "music_performance", "other"]),
  title: z.string().trim().min(1, "Enter a title.").max(200), details: shortText(4000), owner_user_id: optionalId, owner_name: shortText(160), supplier_id: optionalId,
  due_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).transform((value) => value || null), event_at: optionalLocalDateTime,
  quantity: z.union([z.literal(""), z.coerce.number().int().min(0).max(100000)]).transform((value) => value === "" ? null : value),
  reference_url: z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Reference links must start with https://" })]).transform((value) => value || null),
  status: z.enum(["not_started", "in_progress", "ready", "done", "cancelled"]),
});
const arrangementFields = (form: FormData) => ({
  function_id: text(form, "function_id"), category: text(form, "category"), title: text(form, "title"), details: text(form, "details"), owner_user_id: text(form, "owner_user_id"),
  owner_name: text(form, "owner_name"), supplier_id: text(form, "supplier_id"), due_date: text(form, "due_date"), event_at: text(form, "event_at"), quantity: text(form, "quantity"),
  reference_url: text(form, "reference_url").trim(), status: text(form, "status") || "not_started",
});

export async function createArrangementAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Arrangement added.", async (weddingId) => {
    const lines = text(form, "checklist").split("\n").map((line) => line.trim()).filter(Boolean);
    await createArrangement(weddingId, arrangementSchema.parse(arrangementFields(form)), z.array(z.string().max(300, "Keep each checklist line under 300 characters.")).max(200).parse(lines), submissionKey(form));
  });
}

export async function updateArrangementAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Arrangement updated.", async (weddingId) => {
    await updateArrangement(weddingId, id.parse(text(form, "arrangementId")), version.parse(text(form, "version")), { ...arrangementSchema.parse(arrangementFields(form)), approve_design: text(form, "approve_design") === "on" });
  });
}

export async function addChecklistLineAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Checklist line added.", async (weddingId) => {
    await addChecklistLine(weddingId, id.parse(text(form, "arrangementId")), z.string().trim().min(1, "Enter the checklist line.").max(300).parse(text(form, "label")));
  });
}

export async function toggleChecklistLineAction(_state: OperationsActionState, form: FormData): Promise<OperationsActionState> {
  return run(form, "Checklist updated.", async (weddingId) => { await setChecklistLine(weddingId, id.parse(text(form, "lineId")), text(form, "isDone") === "true"); });
}
