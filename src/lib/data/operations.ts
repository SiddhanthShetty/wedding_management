import "server-only";
import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listActiveMemberNames } from "@/lib/data/member-names";
import { canEditLogistics, isDuplicateSubmission } from "@/lib/data/travel";
import { localDateTimeToInstant } from "@/lib/planning/local-time";
import type { ArrangementCategory, ArrangementStatus, IssueSeverity, IssueStatus, ScheduleStatus } from "@/lib/planning/operations-rules";

export class OperationsRuleError extends Error { constructor(message: string) { super(message); this.name = "OperationsRuleError"; } }
export class OperationsConflictError extends Error { constructor() { super("This record was changed by someone else. Refresh and review it before saving again."); this.name = "OperationsConflictError"; } }

function check(error: { code?: string; message: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "23514" && !/violates check constraint/.test(error.message)) throw new OperationsRuleError(error.message);
  if (error.code === "23514") throw new OperationsRuleError("Check the times and required fields. A delayed item needs a delay note, and the end must be after the start.");
  if (error.code === "23505") throw new OperationsRuleError("That link already exists.");
  if (error.code === "23503") throw new OperationsRuleError("A linked function, vendor or person is not part of this wedding.");
  if (error.code === "42501") throw new AuthorizationDeniedError();
  throw new Error(fallback);
}

export type OpsFunction = { id: string; name: string; function_date: string | null; starts_at: string | null; ends_at: string | null; venue_name: string | null; status: string };
export type OpsSupplier = { id: string; name: string; category: string; contact_person: string; contact_phone: string };

export async function getOperationsWorkspace(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "read");
  const supabase = await createSupabaseServerClient();
  const [references, items, dependencies, issues, arrangements, checklist] = await Promise.all([
    supabase.rpc("get_operations_references", { p_wedding_id: weddingId }),
    supabase.from("schedule_items").select("id,function_id,activity,location,planned_start,planned_end,actual_start,actual_end,owner_user_id,owner_name,backup_contact,supplier_id,vendor_arrival_at,setup_requirements,packup_requirements,status,delay_note,notes,version,updated_at").eq("wedding_id", weddingId).order("planned_start"),
    supabase.from("schedule_dependencies").select("item_id,depends_on_item_id").eq("wedding_id", weddingId),
    supabase.from("wedding_day_issues").select("id,function_id,schedule_item_id,title,details,severity,owner_user_id,owner_name,status,resolution_note,resolved_at,version,created_at,updated_at").eq("wedding_id", weddingId).order("created_at"),
    supabase.from("arrangement_items").select("id,function_id,category,title,details,owner_user_id,owner_name,supplier_id,due_date,event_at,quantity,reference_url,design_approved_at,design_approved_by_user_id,status,version,updated_at").eq("wedding_id", weddingId).order("due_date", { nullsFirst: false }),
    supabase.from("arrangement_checklist_items").select("id,arrangement_id,label,is_done,position").eq("wedding_id", weddingId).order("position"),
  ]);
  for (const result of [references, items, dependencies, issues, arrangements, checklist]) if (result.error) throw new Error("Could not load wedding-day operations.");
  const refs = (references.data ?? {}) as { functions?: OpsFunction[]; suppliers?: OpsSupplier[] };
  return {
    wedding: context.wedding,
    canEdit: canEditLogistics(context),
    functions: refs.functions ?? [],
    suppliers: refs.suppliers ?? [],
    members: await listActiveMemberNames(weddingId),
    items: (items.data ?? []) as Array<{ id: string; function_id: string; activity: string; location: string; planned_start: string; planned_end: string; actual_start: string | null; actual_end: string | null; owner_user_id: string | null; owner_name: string; backup_contact: string; supplier_id: string | null; vendor_arrival_at: string | null; setup_requirements: string; packup_requirements: string; status: ScheduleStatus; delay_note: string; notes: string; version: number; updated_at: string }>,
    dependencies: dependencies.data ?? [],
    issues: (issues.data ?? []) as Array<{ id: string; function_id: string | null; schedule_item_id: string | null; title: string; details: string; severity: IssueSeverity; owner_user_id: string | null; owner_name: string; status: IssueStatus; resolution_note: string; resolved_at: string | null; version: number; created_at: string; updated_at: string }>,
    arrangements: (arrangements.data ?? []) as Array<{ id: string; function_id: string | null; category: ArrangementCategory; title: string; details: string; owner_user_id: string | null; owner_name: string; supplier_id: string | null; due_date: string | null; event_at: string | null; quantity: number | null; reference_url: string | null; design_approved_at: string | null; design_approved_by_user_id: string | null; status: ArrangementStatus; version: number; updated_at: string }>,
    checklist: checklist.data ?? [],
    generatedAt: new Date().toISOString(),
  };
}
export type OperationsWorkspace = Awaited<ReturnType<typeof getOperationsWorkspace>>;

async function editor(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "edit");
  return { context, supabase: await createSupabaseServerClient() };
}

export type ScheduleItemInput = {
  function_id: string; activity: string; location: string; planned_start: string; planned_end: string; actual_start: string; actual_end: string;
  owner_user_id: string | null; owner_name: string; backup_contact: string; supplier_id: string | null; vendor_arrival_at: string;
  setup_requirements: string; packup_requirements: string; status: ScheduleStatus; delay_note: string; notes: string;
};

function scheduleInstants(input: ScheduleItemInput, timezone: string) {
  const values = {
    ...input,
    planned_start: localDateTimeToInstant(input.planned_start, timezone),
    planned_end: localDateTimeToInstant(input.planned_end, timezone),
    actual_start: localDateTimeToInstant(input.actual_start, timezone),
    actual_end: localDateTimeToInstant(input.actual_end, timezone),
    vendor_arrival_at: localDateTimeToInstant(input.vendor_arrival_at, timezone),
  };
  if (!values.planned_start || !values.planned_end) throw new OperationsRuleError("Enter the planned start and end.");
  if (new Date(values.planned_end) <= new Date(values.planned_start)) throw new OperationsRuleError("The planned end must be after the planned start.");
  return values;
}

export async function createScheduleItem(weddingId: string, input: ScheduleItemInput, dependsOn: string[], submissionKey: string | null) {
  const { context, supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("schedule_items").insert({ ...scheduleInstants(input, context.wedding.timezone), wedding_id: weddingId, created_by_user_id: context.user.id, submission_key: submissionKey }).select("id").single();
  if (isDuplicateSubmission(error)) return;
  check(error, "Could not add the schedule item.");
  if (dependsOn.length) {
    const deps = await supabase.from("schedule_dependencies").insert(dependsOn.map((id) => ({ wedding_id: weddingId, item_id: data!.id, depends_on_item_id: id })));
    check(deps.error, "The item was added, but its dependencies could not be saved.");
  }
}

/** Updates one item only. Other items are never shifted when this one changes. */
export async function updateScheduleItem(weddingId: string, itemId: string, expectedVersion: number, input: ScheduleItemInput) {
  const { context, supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("schedule_items").update(scheduleInstants(input, context.wedding.timezone)).eq("wedding_id", weddingId).eq("id", itemId).eq("version", expectedVersion).select("id").maybeSingle();
  check(error, "Could not update the schedule item.");
  if (!data) throw new OperationsConflictError();
}

/** Quick live updates: mark started / done with the current time, or record a delay note. */
export async function recordScheduleProgress(weddingId: string, itemId: string, expectedVersion: number, change: { kind: "start" | "done" | "delay"; delay_note?: string }) {
  const { supabase } = await editor(weddingId);
  const now = new Date().toISOString();
  const values = change.kind === "start" ? { actual_start: now, status: "in_progress" }
    : change.kind === "done" ? { actual_end: now, status: "done" }
    : { status: "delayed", delay_note: change.delay_note ?? "" };
  const { data, error } = await supabase.from("schedule_items").update(values).eq("wedding_id", weddingId).eq("id", itemId).eq("version", expectedVersion).select("id").maybeSingle();
  check(error, "Could not record progress.");
  if (!data) throw new OperationsConflictError();
}

export async function addScheduleDependency(weddingId: string, itemId: string, dependsOn: string) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.from("schedule_dependencies").insert({ wedding_id: weddingId, item_id: itemId, depends_on_item_id: dependsOn });
  check(error, "Could not add the dependency.");
}

export async function removeScheduleDependency(weddingId: string, itemId: string, dependsOn: string) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.from("schedule_dependencies").delete().eq("wedding_id", weddingId).eq("item_id", itemId).eq("depends_on_item_id", dependsOn);
  check(error, "Could not remove the dependency.");
}

export type IssueInput = { function_id: string | null; schedule_item_id: string | null; title: string; details: string; severity: IssueSeverity; owner_user_id: string | null; owner_name: string };

export async function createIssue(weddingId: string, input: IssueInput, submissionKey: string | null) {
  const { context, supabase } = await editor(weddingId);
  const { error } = await supabase.from("wedding_day_issues").insert({ ...input, wedding_id: weddingId, created_by_user_id: context.user.id, submission_key: submissionKey });
  if (isDuplicateSubmission(error)) return;
  check(error, "Could not log the issue.");
}

export async function updateIssue(weddingId: string, issueId: string, expectedVersion: number, input: { status: IssueStatus; severity: IssueSeverity; owner_user_id: string | null; owner_name: string; resolution_note: string }) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("wedding_day_issues").update({ ...input, resolved_at: input.status === "resolved" ? new Date().toISOString() : null }).eq("wedding_id", weddingId).eq("id", issueId).eq("version", expectedVersion).select("id").maybeSingle();
  check(error, "Could not update the issue.");
  if (!data) throw new OperationsConflictError();
}

export type ArrangementInput = { function_id: string | null; category: ArrangementCategory; title: string; details: string; owner_user_id: string | null; owner_name: string; supplier_id: string | null; due_date: string | null; event_at: string; quantity: number | null; reference_url: string | null; status: ArrangementStatus };

export async function createArrangement(weddingId: string, input: ArrangementInput, checklist: string[], submissionKey: string | null) {
  const { context, supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("arrangement_items").insert({ ...input, event_at: localDateTimeToInstant(input.event_at, context.wedding.timezone), wedding_id: weddingId, created_by_user_id: context.user.id, submission_key: submissionKey }).select("id").single();
  if (isDuplicateSubmission(error)) return;
  check(error, "Could not add the arrangement.");
  if (checklist.length) {
    const lines = await supabase.from("arrangement_checklist_items").insert(checklist.map((label, position) => ({ wedding_id: weddingId, arrangement_id: data!.id, label, position })));
    check(lines.error, "The arrangement was added, but its checklist could not be saved.");
  }
}

export async function updateArrangement(weddingId: string, arrangementId: string, expectedVersion: number, input: ArrangementInput & { approve_design: boolean }) {
  const { context, supabase } = await editor(weddingId);
  const { approve_design: approve, ...values } = input;
  const current = await supabase.from("arrangement_items").select("design_approved_at,reference_url").eq("wedding_id", weddingId).eq("id", arrangementId).maybeSingle();
  check(current.error, "Could not load the arrangement.");
  if (!current.data) throw new OperationsConflictError();
  // Changing the reference clears a previous approval: an approval applies to one specific design.
  const referenceChanged = current.data.reference_url !== values.reference_url;
  const approval = approve && values.reference_url
    ? (referenceChanged || !current.data.design_approved_at ? { design_approved_at: new Date().toISOString(), design_approved_by_user_id: context.user.id } : {})
    : { design_approved_at: null, design_approved_by_user_id: null };
  const { data, error } = await supabase.from("arrangement_items").update({ ...values, ...approval, event_at: localDateTimeToInstant(values.event_at, context.wedding.timezone) }).eq("wedding_id", weddingId).eq("id", arrangementId).eq("version", expectedVersion).select("id").maybeSingle();
  check(error, "Could not update the arrangement.");
  if (!data) throw new OperationsConflictError();
}

export async function addChecklistLine(weddingId: string, arrangementId: string, label: string) {
  const { supabase } = await editor(weddingId);
  const last = await supabase.from("arrangement_checklist_items").select("position").eq("wedding_id", weddingId).eq("arrangement_id", arrangementId).order("position", { ascending: false }).limit(1);
  check(last.error, "Could not add the checklist line.");
  const { error } = await supabase.from("arrangement_checklist_items").insert({ wedding_id: weddingId, arrangement_id: arrangementId, label, position: (last.data?.[0]?.position ?? -1) + 1 });
  check(error, "Could not add the checklist line.");
}

export async function setChecklistLine(weddingId: string, lineId: string, isDone: boolean) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("arrangement_checklist_items").update({ is_done: isDone }).eq("wedding_id", weddingId).eq("id", lineId).select("id").maybeSingle();
  check(error, "Could not update the checklist line.");
  if (!data) throw new OperationsConflictError();
}
