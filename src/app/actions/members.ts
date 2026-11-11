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
  if (!parsed.success) return { error: "Check the email, role and what they can access." };

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
    return { message: "Saved. Their access is updated." };
  } catch {
    return { error: "Could not update membership. Only an owner or co-owner can manage members; owner roles require an owner account." };
  }
}

export async function revokeMemberAction(_previous: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const parsed = z.object({ weddingId: z.uuid(), targetUserId: z.uuid() }).safeParse({
    weddingId: formData.get("weddingId"),
    targetUserId: formData.get("targetUserId"),
  });
  if (!parsed.success) return { error: "Invalid membership selection." };
  try {
    await revokeWeddingMember(parsed.data);
    revalidatePath("/settings");
    return { message: "Membership revoked. Access is removed for future requests." };
  } catch {
    return { error: "Could not revoke membership. An active owner must remain on the wedding." };
  }
}
