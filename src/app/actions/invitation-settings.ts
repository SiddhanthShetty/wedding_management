"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { discardInvitationDraft, InvitationSettingsError, publishInvitation, restoreInvitationVersion, saveInvitationDraft } from "@/lib/data/invitation-settings";
import { settingsFromForm } from "@/lib/invitation/settings";

export type InvitationEditState = { error?: string; message?: string; errors?: Record<string, string>; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };
const weddingOf = (form: FormData) => z.uuid().safeParse(text(form, "weddingId"));
const baseOf = (form: FormData) => text(form, "base") || null;

function failure(error: unknown): InvitationEditState {
  if (error instanceof InvitationSettingsError) return { error: error.message };
  if (error instanceof AuthorizationDeniedError) return { error: "Only the couple (owners and co-owners) can edit the invitation." };
  return { error: "Couldn't save this change. Nothing was changed; try again." };
}
const done = (message: string): InvitationEditState => { revalidatePath("/guests/invitation"); return { message, at: Date.now() }; };

/** Saves the wording as a draft. Families keep seeing the published wording. */
export async function saveInvitationDraftAction(_state: InvitationEditState, form: FormData): Promise<InvitationEditState> {
  const wedding = weddingOf(form);
  if (!wedding.success) return { error: "Refresh the page and try again." };
  const parsed = settingsFromForm(form);
  if (!parsed.ok) return { error: "Check the highlighted boxes. Nothing was saved.", errors: parsed.errors };
  try { await saveInvitationDraft(wedding.data, parsed.settings, baseOf(form)); }
  catch (error) { return failure(error); }
  return done("Draft saved. The preview shows it; families don't see it until you publish.");
}

export async function publishInvitationAction(_state: InvitationEditState, form: FormData): Promise<InvitationEditState> {
  const wedding = weddingOf(form);
  if (!wedding.success) return { error: "Refresh the page and try again." };
  try {
    const version = await publishInvitation(wedding.data, baseOf(form));
    revalidatePath("/i/[code]", "page");
    return done(`Published (version ${version}). Families see it the next time they open their link.`);
  } catch (error) { return failure(error); }
}

export async function discardInvitationDraftAction(_state: InvitationEditState, form: FormData): Promise<InvitationEditState> {
  const wedding = weddingOf(form);
  if (!wedding.success) return { error: "Refresh the page and try again." };
  try { await discardInvitationDraft(wedding.data); }
  catch (error) { return failure(error); }
  return done("Draft discarded. The preview shows what families see.");
}

export async function restoreInvitationVersionAction(_state: InvitationEditState, form: FormData): Promise<InvitationEditState> {
  const wedding = weddingOf(form);
  const version = z.coerce.number().int().min(1).safeParse(text(form, "version"));
  if (!wedding.success || !version.success) return { error: "Refresh the page and try again." };
  try { await restoreInvitationVersion(wedding.data, version.data); }
  catch (error) { return failure(error); }
  return done(`Version ${version.data} is in the draft now. Check the preview, then publish it.`);
}
