"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { CommunicationRuleError } from "@/lib/data/communications";
import { addReadyTemplate, addStarterReminderTemplate, applyFunctionSet, applyTaskChecklist } from "@/lib/data/setup";

export type SetupActionState = { error?: string; message?: string; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };

class PickNothingError extends Error {}

async function run(form: FormData, task: (weddingId: string) => Promise<string>, paths: string[]): Promise<SetupActionState> {
  const wedding = z.uuid().safeParse(text(form, "weddingId"));
  if (!wedding.success) return { error: "Something went wrong with this page. Refresh it and try again." };
  try {
    const message = await task(wedding.data);
    for (const path of paths) revalidatePath(path);
    return { message, at: Date.now() };
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return { error: "You can't change this. Ask the couple if you need something changed." };
    if (error instanceof CommunicationRuleError) return { error: error.message };
    if (error instanceof PickNothingError) return { error: "Tick at least one task." };
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
    // From the Tasks page you tick which ones to add; from Home it adds the whole list.
    const picked = form.getAll("starterTask").filter((value): value is string => typeof value === "string");
    if (form.get("picking") === "1" && !picked.length) throw new PickNothingError();
    const result = await applyTaskChecklist(weddingId, form.get("picking") === "1" ? picked : undefined);
    if (!result.added) return "Those tasks are already in your list.";
    return `Added ${result.added} task(s)${result.dated ? " with due dates counted back from your wedding date" : " without due dates (set your wedding date to add them)"}.${result.skipped ? ` ${result.skipped} already existed.` : ""}`;
  }, ["/overview", "/tasks"]);
}

export async function addStarterReminderAction(_state: SetupActionState, form: FormData): Promise<SetupActionState> {
  return run(form, async (weddingId) => { await addStarterReminderTemplate(weddingId); return "Starter reminder template added."; }, ["/messages"]);
}

/** Adds a ready-made message from Messages (gentle reminder, last call, directions). */
export async function addReadyMessageAction(_state: SetupActionState, form: FormData): Promise<SetupActionState> {
  const key = text(form, "key");
  return run(form, async (weddingId) => (await addReadyTemplate(weddingId, key)) === "added" ? "Added. Choose it under “Prepare messages”." : "You already have this message.", ["/messages"]);
}
