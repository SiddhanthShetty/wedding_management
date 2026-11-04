"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import {
  addTaskChecklistItem,
  addTaskComment,
  createWeddingTask,
  TaskEditConflictError,
  updateTaskChecklistItem,
  updateWeddingTask,
} from "@/lib/data/tasks";
import { taskFormValues } from "@/lib/planning/task-inputs";

export type TaskFormState = { error?: string; message?: string; savedId?: string };

const readText = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

function getActionError(error: unknown) {
  if (error instanceof TaskEditConflictError) return "This task was changed by someone else. Refresh the list and review their changes before saving again.";
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the task details.";
  if (error instanceof AuthorizationDeniedError) return "Your planning edit access is no longer available. Refresh and try again.";
  if (error instanceof Error && /circular|depend/i.test(error.message)) return error.message;
  return "The change could not be saved. No success was recorded; refresh and try again.";
}

export async function createTaskAction(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const weddingId = z.uuid().safeParse(readText(formData, "weddingId"));
  if (!weddingId.success) return { error: "Invalid wedding workspace." };
  try {
    const task = await createWeddingTask(weddingId.data, taskFormValues(formData));
    revalidatePath("/tasks");
    return { message: "Task created.", savedId: task.id };
  } catch (error) {
    return { error: getActionError(error) };
  }
}

export async function updateTaskAction(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const weddingId = z.uuid().safeParse(readText(formData, "weddingId"));
  const taskId = z.uuid().safeParse(readText(formData, "taskId"));
  const version = z.coerce.number().int().positive().safeParse(readText(formData, "version"));
  if (!weddingId.success || !taskId.success || !version.success) return { error: "Invalid task selection or version." };
  try {
    await updateWeddingTask(weddingId.data, taskId.data, version.data, taskFormValues(formData));
    revalidatePath("/tasks");
    return { message: "Task updated.", savedId: taskId.data };
  } catch (error) {
    return { error: getActionError(error) };
  }
}

export async function addTaskCommentAction(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const weddingId = z.uuid().safeParse(readText(formData, "weddingId"));
  const taskId = z.uuid().safeParse(readText(formData, "taskId"));
  const body = z.string().trim().min(1).max(4000).safeParse(readText(formData, "body"));
  if (!weddingId.success || !taskId.success || !body.success) return { error: "Enter a task comment under 4,000 characters." };
  try {
    await addTaskComment(weddingId.data, taskId.data, body.data);
    revalidatePath("/tasks");
    return { message: "Comment added." };
  } catch (error) {
    return { error: getActionError(error) };
  }
}

export async function addTaskChecklistItemAction(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const weddingId = z.uuid().safeParse(readText(formData, "weddingId"));
  const taskId = z.uuid().safeParse(readText(formData, "taskId"));
  const title = z.string().trim().min(1).max(300).safeParse(readText(formData, "title"));
  if (!weddingId.success || !taskId.success || !title.success) return { error: "Enter a checklist item under 300 characters." };
  try {
    await addTaskChecklistItem(weddingId.data, taskId.data, title.data);
    revalidatePath("/tasks");
    return { message: "Checklist item added." };
  } catch (error) {
    return { error: getActionError(error) };
  }
}

export async function toggleTaskChecklistAction(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const weddingId = z.uuid().safeParse(readText(formData, "weddingId"));
  const itemId = z.uuid().safeParse(readText(formData, "itemId"));
  const isComplete = z.enum(["true", "false"]).safeParse(readText(formData, "isComplete"));
  if (!weddingId.success || !itemId.success || !isComplete.success) return { error: "Invalid checklist item." };
  try {
    await updateTaskChecklistItem(weddingId.data, itemId.data, isComplete.data === "true");
    revalidatePath("/tasks");
    return { message: "Checklist updated." };
  } catch (error) {
    return { error: getActionError(error) };
  }
}
