"use server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { createPreviewLink, moderateBlessing, saveDesignPhoto } from "@/lib/data/invitations";
import { checkPhotoDataUrl } from "@/lib/invitations/photo";
import { parseSite } from "@/lib/invitations/site";
import { cleanTextOverrides, InvitationConflictError, InvitationRuleError, prepareGuestInvitation, recordInvitationShared, saveDesign, setDefaultDesign, setHouseholdLanguage } from "@/lib/data/invitations";
import { messageWithoutLink } from "@/lib/invitations/content";

export type InvitationActionState = { error?: string; message?: string; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };
const id = z.uuid();
const themeIds = ["mallige", "veena", "kolam", "thoranam", "yakshagana", "kanchi"] as const;
const languageCodes = ["en", "hi", "kn", "tcy"] as const;

function failure(error: unknown): InvitationActionState {
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the entered values." };
  if (error instanceof InvitationRuleError || error instanceof InvitationConflictError) return { error: error.message };
  if (error instanceof AuthorizationDeniedError) return { error: "Your guest-list edit access is no longer available. Refresh and try again." };
  if (error instanceof Error && error.message.startsWith("Could not create a private household link")) return { error: error.message };
  return { error: "The change could not be saved. Nothing was recorded; refresh and try again." };
}

async function run(form: FormData, task: (weddingId: string) => Promise<string>): Promise<InvitationActionState> {
  const wedding = id.safeParse(text(form, "weddingId"));
  if (!wedding.success) return { error: "Invalid wedding workspace." };
  try { const message = await task(wedding.data); revalidatePath("/invitations"); return { message, at: Date.now() }; } catch (error) { return failure(error); }
}

export async function saveDesignAction(_state: InvitationActionState, form: FormData): Promise<InvitationActionState> {
  return run(form, async (weddingId) => {
    const designId = z.union([id, z.literal("")]).parse(text(form, "designId"));
    const version = z.union([z.literal(""), z.coerce.number().int().positive()]).parse(text(form, "version"));
    const input = z.object({
      name: z.string().trim().min(1, "Name the design.").max(80), theme: z.enum(themeIds),
      accent: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a colour.")]).transform((value) => value || null),
      show_monogram: z.boolean(),
    }).parse({ name: text(form, "name"), theme: text(form, "theme"), accent: text(form, "useAccent") === "on" ? text(form, "accent") : "", show_monogram: text(form, "showMonogram") === "on" });
    let raw: unknown;
    try { raw = JSON.parse(text(form, "texts") || "{}"); } catch { throw new InvitationRuleError("The wording could not be read. Refresh and try again."); }
    // The studio saves the card and the invitation website together; older forms send only the card.
    let site;
    if (form.has("site")) {
      let rawSite: unknown;
      try { rawSite = JSON.parse(text(form, "site") || "{}"); } catch { throw new InvitationRuleError("The website content could not be read. Refresh and try again."); }
      try { site = parseSite(rawSite); } catch (error) { throw new InvitationRuleError((error as Error).message); }
    }
    await saveDesign(weddingId, designId || null, version === "" ? null : version, { ...input, texts: cleanTextOverrides(raw), ...(site ? { site } : {}) });
    return designId ? "Saved. Guests see the changes the next time they open their link." : "Design created.";
  });
}

export async function setDefaultDesignAction(_state: InvitationActionState, form: FormData): Promise<InvitationActionState> {
  return run(form, async (weddingId) => { await setDefaultDesign(weddingId, id.parse(text(form, "designId"))); return "Guests will now see this design."; });
}

export async function setHouseholdLanguageAction(_state: InvitationActionState, form: FormData): Promise<InvitationActionState> {
  return run(form, async (weddingId) => {
    await setHouseholdLanguage(weddingId, id.parse(text(form, "householdId")), z.enum(languageCodes).parse(text(form, "language")));
    return "Language saved.";
  });
}

/** Returns a one-time private link token for the planner's device. Not stored anywhere. */
export async function prepareInvitationAction(weddingId: string, guestId: string): Promise<{ token?: string; expiresAt?: string; error?: string }> {
  const parsed = z.object({ weddingId: id, guestId: id }).safeParse({ weddingId, guestId });
  if (!parsed.success) return { error: "Invalid guest." };
  try { return await prepareGuestInvitation(parsed.data.weddingId, parsed.data.guestId); } catch (error) { return { error: failure(error).error }; }
}

/** A 30-minute family preview link for one design; the token is shown once. */
export async function createPreviewLinkAction(weddingId: string, designId: string): Promise<{ token?: string; expiresAt?: string; error?: string }> {
  const parsed = z.object({ weddingId: id, designId: id }).safeParse({ weddingId, designId });
  if (!parsed.success) return { error: "Save the design first." };
  try { return await createPreviewLink(parsed.data.weddingId, parsed.data.designId); } catch (error) { return { error: failure(error).error }; }
}

export async function recordInvitationSharedAction(input: { weddingId: string; guestId: string; designId: string; channel: string; message: string; link: string }): Promise<InvitationActionState> {
  const parsed = z.object({ weddingId: id, guestId: id, designId: id, channel: z.enum(["whatsapp", "email", "other"]), message: z.string().min(1).max(8000), link: z.string().max(500) }).safeParse(input);
  if (!parsed.success) return { error: "Could not record this invitation." };
  try {
    const result = await recordInvitationShared(parsed.data.weddingId, { guestId: parsed.data.guestId, designId: parsed.data.designId, channel: parsed.data.channel, message: messageWithoutLink(parsed.data.message, parsed.data.link) });
    revalidatePath("/invitations"); revalidatePath("/messages");
    return { message: result.recorded ? "Recorded as sent manually. Delivery is not confirmed." : "Already recorded for this design and channel.", at: Date.now() };
  } catch (error) { return failure(error); }
}

export async function moderateBlessingAction(_state: InvitationActionState, form: FormData): Promise<InvitationActionState> {
  return run(form, async (weddingId) => {
    const status = z.enum(["approved", "hidden"]).parse(text(form, "status"));
    await moderateBlessing(weddingId, id.parse(text(form, "blessingId")), status);
    return status === "approved" ? "Blessing approved. Guests can now see it." : "Blessing hidden.";
  });
}

/** Photo arrives already resized on the device; the server still checks type, size and content. */
export async function saveDesignPhotoAction(_state: InvitationActionState, form: FormData): Promise<InvitationActionState> {
  return run(form, async (weddingId) => {
    const designId = id.parse(text(form, "designId"));
    const version = z.coerce.number().int().positive().parse(text(form, "version"));
    const raw = text(form, "photo");
    if (!raw) { await saveDesignPhoto(weddingId, designId, version, null); return "Photo removed."; }
    const problem = checkPhotoDataUrl(raw);
    if (problem) throw new InvitationRuleError(problem);
    await saveDesignPhoto(weddingId, designId, version, raw);
    return "Photo saved. It appears on the card and on guests' invitation pages.";
  });
}
