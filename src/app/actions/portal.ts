"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { submitPortalBlessing } from "@/lib/guest-portal/server";

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
