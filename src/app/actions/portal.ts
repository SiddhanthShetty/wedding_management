"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isoTimestampInput } from "@/lib/planning/guest-inputs";
import { recordPortalFamilyRsvps, renamePortalPlaceholder, submitPortalBlessing } from "@/lib/guest-portal/server";

/** Result codes only: the portal shows them in the guest's language. */
export type BlessingState = { status?: "saved" | "duplicate" | "limit" | "invalid" | "unavailable"; savedKey?: string };

export async function submitBlessingAction(_state: BlessingState, form: FormData): Promise<BlessingState> {
  const parsed = z.object({ message: z.string().trim().min(1).max(500), submissionKey: z.uuid() })
    .safeParse({ message: form.get("message"), submissionKey: form.get("submissionKey") });
  if (!parsed.success) return { status: "invalid" };
  const result = await submitPortalBlessing(parsed.data);
  if (result.status === "saved" || result.status === "duplicate") revalidatePath("/guest");
  return { status: result.status, savedKey: parsed.data.submissionKey };
}

const reply = z.object({ invitationId: z.uuid(), note: z.string().max(2000), expectedUpdatedAt: z.union([isoTimestampInput, z.literal("")]), submissionKey: z.uuid() });
const familyReply = z.array(z.object({ guestId: z.uuid(), responses: z.array(reply).min(1).max(50) })).min(1).max(30);

/** Result codes and the people saved: the portal shows them in the guest's language. */
export type FamilyReplyState = { status?: "saved" | "duplicate" | "conflict" | "invalid" | "unavailable"; saved?: string[] };

/** "All of us, to all events": "Yes" for every invitation of every person on this link. */
export async function replyAllYesAction(input: unknown): Promise<FamilyReplyState> {
  const parsed = familyReply.safeParse(input);
  if (!parsed.success) return { status: "invalid", saved: [] };
  const result = await recordPortalFamilyRsvps(parsed.data.map((person) => ({
    guestId: person.guestId,
    responses: person.responses.map((entry) => ({ invitationId: entry.invitationId, response: "yes" as const, note: entry.note, expectedUpdatedAt: entry.expectedUpdatedAt || null, submissionKey: entry.submissionKey })),
  })));
  if (result.saved.length) revalidatePath("/guest");
  return { status: result.status, saved: result.saved };
}

export type NameState = { status?: "saved" | "duplicate" | "conflict" | "invalid" | "unavailable"; savedKey?: string };

/** Names someone the hosts added as "<family> guest N". */
export async function namePlaceholderAction(_state: NameState, form: FormData): Promise<NameState> {
  const parsed = z.object({ guestId: z.uuid(), fullName: z.string().trim().min(1).max(120), submissionKey: z.uuid() })
    .safeParse({ guestId: form.get("guestId"), fullName: form.get("fullName"), submissionKey: form.get("submissionKey") });
  if (!parsed.success) return { status: "invalid" };
  const result = await renamePortalPlaceholder(parsed.data);
  if (result.status === "saved" || result.status === "duplicate") revalidatePath("/guest");
  return { status: result.status, savedKey: parsed.data.submissionKey };
}
