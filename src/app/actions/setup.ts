"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { CommunicationRuleError } from "@/lib/data/communications";
import { addStarterReminderTemplate, applyFunctionSet, applyTaskChecklist } from "@/lib/data/setup";

export type SetupActionState = { error?: string; message?: string; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };

async function run(form: FormData, task: (weddingId: string) => Promise<string>, paths: string[]): Promise<SetupActionState> {
  const wedding = z.uuid().safeParse(text(form, "weddingId"));
  if (!wedding.success) return { error: "Invalid wedding workspace." };
  try {
    const message = await task(wedding.data);
    for (const path of paths) revalidatePath(path);
    return { message, at: Date.now() };
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return { error: "You need planning edit access for this." };
    if (error instanceof CommunicationRuleError) return { error: error.message };
    return { error: "Nothing was added. Refresh and try again." };
  }
}

export async function applyFunctionSetAction(_state: SetupActionState, form: FormData): Promise<SetupActionState> {
  return run(form, async (weddingId) => {
    const result = await applyFunctionSet(weddingId, z.enum(["mangalorean", "simple"]).parse(text(form, "setId")));
    if (!result.added) return "All of these functions already exist.";
    return `Added ${result.added} function(s) as Planned${result.dated ? ", dated around your wedding day" : ". Set your wedding date to date them automatically next time"}.${result.skipped ? ` ${result.skipped} already existed.` : ""}`;
  }, ["/overview", "/functions"]);
}

export async function applyTaskChecklistAction(_state: SetupActionState, form: FormData): Promise<SetupActionState> {
  return run(form, async (weddingId) => {
    const result = await applyTaskChecklist(weddingId);
    if (!result.added) return "The starter checklist is already in your tasks.";
    return `Added ${result.added} task(s)${result.dated ? " with due dates counted back from your wedding date" : " without due dates (set your wedding date to add them)"}.${result.skipped ? ` ${result.skipped} already existed.` : ""}`;
  }, ["/overview", "/tasks"]);
}

export async function addStarterReminderAction(_state: SetupActionState, form: FormData): Promise<SetupActionState> {
  return run(form, async (weddingId) => { await addStarterReminderTemplate(weddingId); return "Starter reminder template added."; }, ["/messages"]);
}
