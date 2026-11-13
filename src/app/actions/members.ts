"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addVerifiedMemberByEmail, revokeWeddingMember } from "@/lib/data/members";

export type MemberFormState = { error?: string; message?: string };

export async function addMemberAction(_previous: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const parsed = z.object({
    weddingId: z.uuid(),
    email: z.email().trim().toLowerCase(),
    role: z.enum(["owner", "co_owner", "scoped_collaborator", "read_only_collaborator"]),
    planning: z.enum(["none", "read", "edit"]),
    suppliers_finance: z.enum(["none", "read", "edit"]),
    guests: z.enum(["none", "read", "edit"]),
    logistics: z.enum(["none", "read", "edit"]),
  }).safeParse({
    weddingId: formData.get("weddingId"),
    email: formData.get("email"),
    role: formData.get("role"),
    planning: formData.get("planning"),
    suppliers_finance: formData.get("suppliers_finance"),
    guests: formData.get("guests"),
    logistics: formData.get("logistics"),
  });
  if (!parsed.success) return { error: "Enter their email address and choose what they can do." };

  const { weddingId, email, role, ...levels } = parsed.data;
  if (role === "read_only_collaborator" && Object.values(levels).some((level) => level === "edit")) {
    return { error: "View-only helpers can only be given view access." };
  }
  const moduleAccess = role === "owner" || role === "co_owner"
    ? {}
    : Object.fromEntries(Object.entries(levels).filter(([, level]) => level !== "none"));
  try {
    await addVerifiedMemberByEmail({ weddingId, email, role, moduleAccess });
    revalidatePath("/settings");
    return { message: role === "owner" || role === "co_owner" ? `Added ${email} as a partner. They can sign in now and see everything.` : `Saved. ${email} can sign in now.` };
  } catch {
    return { error: "Couldn't add them. Check it's the email they signed up with and that they've confirmed it from the email we sent them." };
  }
}

export async function revokeMemberAction(_previous: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const parsed = z.object({ weddingId: z.uuid(), targetUserId: z.uuid() }).safeParse({
    weddingId: formData.get("weddingId"),
    targetUserId: formData.get("targetUserId"),
  });
  if (!parsed.success) return { error: "Something went wrong with this page. Refresh it and try again." };
  try {
    await revokeWeddingMember(parsed.data);
    revalidatePath("/settings");
    return { message: "Removed. They can no longer open your wedding." };
  } catch {
    return { error: "Couldn't remove them. The wedding always needs at least one partner." };
  }
}
