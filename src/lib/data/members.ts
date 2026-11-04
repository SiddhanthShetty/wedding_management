import "server-only";

import { z } from "zod";
import { AuthorizationDeniedError, authorizeWeddingOperation, type AccessLevel, type MemberRole, type WeddingModule } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const roles = z.enum(["owner", "co_owner", "scoped_collaborator", "read_only_collaborator"]);
const modules = z.enum(["planning", "suppliers_finance", "guests", "logistics"]);
const levels = z.enum(["none", "read", "edit"]);

async function requireMemberManager(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId);
  if (context.membership.role !== "owner" && context.membership.role !== "co_owner") {
    throw new AuthorizationDeniedError();
  }
  return context;
}

export async function addVerifiedMemberByEmail(input: {
  weddingId: string;
  email: string;
  role: MemberRole;
  moduleAccess?: Partial<Record<WeddingModule, AccessLevel>>;
}) {
  const values = z.object({
    weddingId: z.uuid(),
    email: z.email().trim().toLowerCase(),
    role: roles,
    moduleAccess: z.partialRecord(modules, z.enum(["read", "edit"])).default({}),
  }).parse(input);
  const context = await requireMemberManager(values.weddingId);
  if ((values.role === "owner" || values.role === "co_owner") && context.membership.role !== "owner") {
    throw new AuthorizationDeniedError();
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_wedding_member_by_email", {
    p_wedding_id: values.weddingId,
    p_email: values.email,
    p_role: values.role,
    p_module_access: values.moduleAccess,
  });
  if (error) throw new Error("Could not add this account to the wedding.");
  return data as string;
}

export async function setMemberModuleAccess(input: {
  weddingId: string;
  targetUserId: string;
  module: WeddingModule;
  accessLevel: "none" | AccessLevel;
}) {
  const values = z.object({ weddingId: z.uuid(), targetUserId: z.uuid(), module: modules, accessLevel: levels }).parse(input);
  await requireMemberManager(values.weddingId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_module_access", {
    p_wedding_id: values.weddingId,
    p_target_user_id: values.targetUserId,
    p_module: values.module,
    p_access_level: values.accessLevel,
  });
  if (error) throw new Error("Could not change the module permission.");
}

export async function revokeWeddingMember(input: { weddingId: string; targetUserId: string }) {
  const values = z.object({ weddingId: z.uuid(), targetUserId: z.uuid() }).parse(input);
  await requireMemberManager(values.weddingId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_wedding_member", {
    p_wedding_id: values.weddingId,
    p_target_user_id: values.targetUserId,
  });
  if (error) throw new Error("Could not revoke this membership.");
}

export async function listWeddingMembers(weddingId: string) {
  const context = await requireMemberManager(weddingId);
  const supabase = await createSupabaseServerClient();
  const { data: members, error } = await supabase
    .from("wedding_members")
    .select("id, user_id, role, status, created_at")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load wedding memberships.");
  const userIds = [...new Set((members ?? []).map((member) => member.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [], error: null };
  if (profileError) throw new Error("Could not load collaborator names.");
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const { data: permissions, error: permissionError } = await supabase
    .from("member_module_permissions")
    .select("membership_id, module, access_level")
    .eq("wedding_id", weddingId);
  if (permissionError) throw new Error("Could not load module permissions.");
  const byMember = new Map<string, Partial<Record<WeddingModule, AccessLevel>>>();
  for (const permission of permissions ?? []) {
    if (permission.access_level === "read" || permission.access_level === "edit") {
      const grants = byMember.get(permission.membership_id) ?? {};
      grants[permission.module as WeddingModule] = permission.access_level;
      byMember.set(permission.membership_id, grants);
    }
  }
  return (members ?? []).map((member) => ({
    id: member.id,
    userId: member.user_id,
    displayName: names.get(member.user_id) || "Wedding member",
    role: member.role as MemberRole,
    status: member.status,
    moduleAccess: byMember.get(member.id) ?? {},
  }));
}
