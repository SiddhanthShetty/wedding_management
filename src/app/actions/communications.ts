"use server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { CommunicationConflictError, CommunicationRuleError, recordMessages, saveTemplate, setRecordState, setTemplateArchived } from "@/lib/data/communications";

export type CommunicationActionState = { error?: string; message?: string; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };
const id = z.uuid();

async function run(form: FormData, task: (weddingId: string) => Promise<string>): Promise<CommunicationActionState> {
  const wedding = id.safeParse(text(form, "weddingId"));
  if (!wedding.success) return { error: "Something went wrong with this page. Refresh it and try again." };
  try {
    const message = await task(wedding.data);
    revalidatePath("/messages");
    return { message, at: Date.now() };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the entered values." };
    if (error instanceof CommunicationRuleError || error instanceof CommunicationConflictError) return { error: error.message };
    if (error instanceof AuthorizationDeniedError) return { error: "You can no longer change this. Refresh the page, and ask the couple if it keeps happening." };
    return { error: "The change could not be saved. Nothing was recorded; refresh and try again." };
  }
}

export async function saveTemplateAction(_state: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  return run(form, async (weddingId) => {
    const templateId = z.union([id, z.literal("")]).parse(text(form, "templateId"));
    const version = z.union([z.literal(""), z.coerce.number().int().positive()]).parse(text(form, "version"));
    const input = z.object({
      kind: z.enum(["invitation", "reminder", "update"]), name: z.string().trim().min(1, "Name the template.").max(120),
      function_id: z.union([id, z.literal("")]).transform((value) => value || null), subject: z.string().trim().max(200), body: z.string().trim().min(1, "Write the message.").max(5000),
    }).parse({ kind: text(form, "kind"), name: text(form, "name"), function_id: text(form, "function_id"), subject: text(form, "subject"), body: text(form, "body") });
    await saveTemplate(weddingId, templateId || null, version === "" ? null : version, input);
    return templateId ? "Template saved." : "Template created.";
  });
}

export async function archiveTemplateAction(_state: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  return run(form, async (weddingId) => {
    const archived = text(form, "archived") === "true";
    await setTemplateArchived(weddingId, id.parse(text(form, "templateId")), archived);
    return archived ? "Template archived." : "Template restored.";
  });
}

export async function recordMessagesAction(_state: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  return run(form, async (weddingId) => {
    const input = z.object({
      templateId: id, functionId: id, guestIds: z.array(id).min(1, "Choose at least one recipient.").max(1000),
      channel: z.enum(["email", "sms", "whatsapp", "phone", "in_person", "post", "other"]), state: z.enum(["drafted", "sent"]), notes: z.string().trim().max(2000),
    }).parse({ templateId: text(form, "templateId"), functionId: text(form, "functionId"), guestIds: form.getAll("guestIds").filter((value) => typeof value === "string"), channel: text(form, "channel"), state: text(form, "state"), notes: text(form, "notes") });
    const result = await recordMessages(weddingId, input);
    const what = input.state === "sent" ? "marked as sent manually (delivery not confirmed)" : "saved as drafts";
    return `${result.recorded} message(s) ${what}.${result.skipped ? ` ${result.skipped} already recorded for this template version and skipped.` : ""}${result.excluded ? ` ${result.excluded} no longer need it (for example they responded) and were not recorded.` : ""}`;
  });
}

export async function setRecordStateAction(_state: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  return run(form, async (weddingId) => {
    const to = z.enum(["sent", "failed", "drafted"]).parse(text(form, "to"));
    await setRecordState(weddingId, id.parse(text(form, "recordId")), to, z.string().max(1000).parse(text(form, "failureReason")));
    return to === "sent" ? "Marked as sent manually. Delivery is not confirmed." : to === "failed" ? "Marked as failed." : "Moved back to draft.";
  });
}
