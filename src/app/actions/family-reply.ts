"use server";

import { revalidatePath } from "next/cache";
import { submitFamilyReply } from "@/lib/family-invites/public";
import { replySchema } from "@/lib/family-invites/rules";

export type FamilyReplyResult = { status: "saved" | "invalid" | "unavailable" | "busy"; field?: string };

/** The family's reply from their link. The database checks the code, the guest limit and the events. */
export async function submitFamilyReplyAction(code: string, payload: unknown): Promise<FamilyReplyResult> {
  if (typeof code !== "string") return { status: "unavailable" };
  const parsed = replySchema(null, null).safeParse(payload);
  if (!parsed.success) return { status: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const value = parsed.data;
  const result = await submitFamilyReply(code, { attending: value.attending, guestCount: value.guestCount, functionIds: value.events, dietary: value.dietary, dietaryNotes: value.dietaryNotes, message: value.message, name: value.fullName, phone: value.phone });
  if (result.status === "saved") revalidatePath(`/i/${code}`);
  return result;
}
