import "server-only";

import { authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { taskInputSchema } from "@/lib/planning/task-inputs";

export class TaskEditConflictError extends Error {
  constructor() { super("This task changed while you were editing it."); this.name = "TaskEditConflictError"; }
}

export type WeddingTask = {
  id: string;
  wedding_id: string;
  function_id: string | null;
  supplier_id: string | null;
  title: string;
  description: string;
  owner_user_id: string | null;
  due_date: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "not_started" | "in_progress" | "blocked" | "completed" | "cancelled";
  related_vendor_reference: string | null;
  related_booking_reference: string | null;
  depends_on_task_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  function_name: string | null;
  owner_name: string | null;
  dependency_title: string | null;
  dependency_status: string | null;
  checklist: Array<{ id: string; title: string; is_complete: boolean; position: number }>;
  comments: Array<{ id: string; body: string; author_user_id: string; author_name: string; created_at: string }>;
  activity: Array<{ id: string; actor_user_id: string | null; actor_name: string; event_type: string; details: Record<string, unknown>; created_at: string }>;
};

const taskColumns = "id, wedding_id, function_id, supplier_id, title, description, owner_user_id, due_date, priority, status, related_vendor_reference, related_booking_reference, depends_on_task_id, created_by_user_id, updated_by_user_id, version, created_at, updated_at";

export async function listTaskAssignees(weddingId: string) {
  await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data: members, error } = await supabase.from("wedding_members")
    .select("user_id, role").eq("wedding_id", weddingId).eq("status", "active").order("created_at");
  if (error) throw new Error("Could not load task owners.");
  const ids = [...new Set((members ?? []).map((member) => member.user_id))];
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [], error: null };
  if (profileError) throw new Error("Could not load task owner names.");
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name || "Wedding member"]));
  return (members ?? []).map((member) => ({ userId: member.user_id, role: member.role, name: names.get(member.user_id) ?? "Wedding member" }));
}

export async function listWeddingTasks(weddingId: string): Promise<WeddingTask[]> {
  await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase.from("tasks").select(taskColumns)
    .eq("wedding_id", weddingId).order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load wedding tasks.");
  const tasks = rows ?? [];
  if (!tasks.length) return [];

  const taskIds = tasks.map((task) => task.id);
  const userIds = [...new Set(tasks.flatMap((task) => [task.owner_user_id, task.created_by_user_id, task.updated_by_user_id]).filter((id): id is string => Boolean(id)))];
  const functionIds = [...new Set(tasks.map((task) => task.function_id).filter((id): id is string => Boolean(id)))];
  const dependencyIds = [...new Set(tasks.map((task) => task.depends_on_task_id).filter((id): id is string => Boolean(id)))];
  const [functionsResult, checklistResult, commentsResult, activityResult] = await Promise.all([
    functionIds.length ? supabase.from("functions").select("id, name").in("id", functionIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("task_checklist_items").select("id, task_id, title, is_complete, position").eq("wedding_id", weddingId).in("task_id", taskIds).order("position"),
    supabase.from("task_comments").select("id, task_id, body, author_user_id, created_at").eq("wedding_id", weddingId).in("task_id", taskIds).order("created_at"),
    supabase.from("task_activity").select("id, task_id, actor_user_id, event_type, details, created_at").eq("wedding_id", weddingId).in("task_id", taskIds).order("created_at", { ascending: false }),
  ]);
  for (const result of [functionsResult, checklistResult, commentsResult, activityResult]) {
    if (result.error) throw new Error("Could not load task details.");
  }
  const profileIds = [...new Set([
    ...userIds,
    ...(commentsResult.data ?? []).map((comment) => comment.author_user_id),
    ...(activityResult.data ?? []).map((event) => event.actor_user_id).filter((id): id is string => Boolean(id)),
  ])];
  const [dependenciesResult, extraProfilesResult] = await Promise.all([
    dependencyIds.length ? supabase.from("tasks").select("id, title, status").eq("wedding_id", weddingId).in("id", dependencyIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? supabase.from("profiles").select("id, display_name").in("id", profileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (dependenciesResult.error || extraProfilesResult.error) throw new Error("Could not load task relationships.");
  const nameById = new Map((extraProfilesResult.data ?? []).map((profile) => [profile.id, profile.display_name || "Wedding member"]));
  const functionById = new Map((functionsResult.data ?? []).map((item) => [item.id, item.name]));
  const dependencyById = new Map((dependenciesResult.data ?? []).map((item) => [item.id, item]));
  const checklistByTask = groupBy(checklistResult.data ?? [], "task_id");
  const commentsByTask = groupBy(commentsResult.data ?? [], "task_id");
  const activityByTask = groupBy(activityResult.data ?? [], "task_id");

  return tasks.map((task) => ({
    ...(task as Omit<WeddingTask, "function_name" | "owner_name" | "dependency_title" | "dependency_status" | "checklist" | "comments" | "activity">),
    function_name: task.function_id ? functionById.get(task.function_id) ?? null : null,
    owner_name: task.owner_user_id ? nameById.get(task.owner_user_id) ?? "Wedding member" : null,
    dependency_title: task.depends_on_task_id ? dependencyById.get(task.depends_on_task_id)?.title ?? null : null,
    dependency_status: task.depends_on_task_id ? dependencyById.get(task.depends_on_task_id)?.status ?? null : null,
    checklist: (checklistByTask.get(task.id) ?? []) as WeddingTask["checklist"],
    comments: (commentsByTask.get(task.id) ?? []).map((comment) => ({
      ...comment,
      author_name: nameById.get(comment.author_user_id) ?? "Wedding member",
    })) as WeddingTask["comments"],
    activity: (activityByTask.get(task.id) ?? []).map((event) => ({
      ...event,
      actor_name: event.actor_user_id ? nameById.get(event.actor_user_id) ?? "Wedding member" : "System",
    })) as WeddingTask["activity"],
  }));
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = String(row[key]);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function mutableValues(input: unknown) {
  const values = taskInputSchema.parse(input);
  return {
    title: values.title,
    description: values.description,
    function_id: values.functionId,
    owner_user_id: values.ownerUserId,
    due_date: values.dueDate,
    priority: values.priority,
    status: values.status,
    related_vendor_reference: values.relatedVendorReference || null,
    related_booking_reference: values.relatedBookingReference || null,
    depends_on_task_id: values.dependsOnTaskId,
  };
}

export async function createWeddingTask(weddingId: string, input: unknown) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const values = mutableValues(input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tasks").insert({
    ...values,
    wedding_id: context.wedding.id,
    created_by_user_id: context.user.id,
    updated_by_user_id: context.user.id,
  }).select(taskColumns).single();
  if (error) throw new Error("Could not create the task. Check its function, owner, and dependency.");
  return data;
}

export async function updateWeddingTask(weddingId: string, taskId: string, expectedVersion: number, input: unknown) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const values = mutableValues(input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tasks").update(values)
    .eq("wedding_id", context.wedding.id).eq("id", taskId).eq("version", expectedVersion)
    .select("id, version").maybeSingle();
  if (error) {
    if (/circular|depend/i.test(error.message)) throw new Error("That dependency would create a circular task chain.");
    throw new Error("Could not update the task. Check its function, owner, and dependency.");
  }
  if (!data) {
    const { data: current, error: currentError } = await supabase.from("tasks").select("version")
      .eq("wedding_id", context.wedding.id).eq("id", taskId).maybeSingle();
    if (currentError) throw new Error("Could not verify the latest task version.");
    if (current) throw new TaskEditConflictError();
    throw new Error("Task not found or access was revoked.");
  }
  return data;
}

export async function addTaskComment(weddingId: string, taskId: string, body: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("task_comments").insert({
    wedding_id: context.wedding.id,
    task_id: taskId,
    body: body.trim(),
  });
  if (error) throw new Error("Could not add the task comment.");
}

export async function addTaskChecklistItem(weddingId: string, taskId: string, title: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: listError } = await supabase.from("task_checklist_items").select("position")
    .eq("wedding_id", context.wedding.id).eq("task_id", taskId).order("position", { ascending: false }).limit(1);
  if (listError) throw new Error("Could not load the task checklist.");
  const { error } = await supabase.from("task_checklist_items").insert({
    wedding_id: context.wedding.id, task_id: taskId, title: title.trim(), position: (existing?.[0]?.position ?? -1) + 1,
  });
  if (error) throw new Error("Could not add the checklist item.");
}

export async function updateTaskChecklistItem(weddingId: string, itemId: string, isComplete: boolean) {
  await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("task_checklist_items").update({ is_complete: isComplete })
    .eq("wedding_id", weddingId).eq("id", itemId);
  if (error) throw new Error("Could not update the checklist item.");
}
