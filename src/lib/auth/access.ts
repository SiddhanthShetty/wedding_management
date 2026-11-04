import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export type WeddingModule = "planning" | "suppliers_finance" | "guests" | "logistics";
export type AccessLevel = "read" | "edit";
export type MemberRole = "owner" | "co_owner" | "scoped_collaborator" | "read_only_collaborator";

export type WorkspaceContext = {
  user: Pick<User, "id" | "email">;
  displayName: string;
  wedding: { id: string; name: string; timezone: string; currency: string; overall_budget: string | null };
  membership: { id: string; role: MemberRole };
  moduleAccess: Partial<Record<WeddingModule, AccessLevel>>;
};

export class AuthenticationRequiredError extends Error {
  constructor() { super("Authentication required."); this.name = "AuthenticationRequiredError"; }
}

export class AuthorizationDeniedError extends Error {
  constructor() { super("You do not have access to this wedding or module."); this.name = "AuthorizationDeniedError"; }
}

export async function getAuthenticatedUser(): Promise<Pick<User, "id" | "email">> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AuthenticationRequiredError();
  return { id: data.user.id, email: data.user.email };
}

export async function requireAuthenticatedUser() {
  try {
    if (!getSupabaseEnvironment()) redirect("/sign-in?reason=configuration");
    return { user: await getAuthenticatedUser(), supabase: await createSupabaseServerClient() };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    throw error;
  }
}

/** Re-read membership and module grants for each server operation; deliberately not cached. */
export async function authorizeWeddingOperation(
  weddingId: string,
  module?: WeddingModule,
  required: AccessLevel = "read",
): Promise<WorkspaceContext> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new AuthenticationRequiredError();
  const user = { id: authData.user.id, email: authData.user.email };

  const { data: membership, error: membershipError } = await supabase
    .from("wedding_members")
    .select("id, role")
    .eq("wedding_id", weddingId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw new Error("Could not verify wedding membership.");
  if (!membership) throw new AuthorizationDeniedError();

  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("id, name, timezone, currency, overall_budget_text:overall_budget::text")
    .eq("id", weddingId)
    .maybeSingle();
  if (weddingError) throw new Error("Could not load the wedding workspace.");
  if (!wedding) throw new AuthorizationDeniedError();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("Could not load the account profile.");

  const { data: grants, error: grantsError } = await supabase
    .from("member_module_permissions")
    .select("module, access_level")
    .eq("wedding_id", weddingId)
    .eq("membership_id", membership.id);
  if (grantsError) throw new Error("Could not verify module permissions.");

  const moduleAccess: WorkspaceContext["moduleAccess"] = {};
  for (const grant of grants ?? []) {
    if (grant.access_level === "read" || grant.access_level === "edit") {
      moduleAccess[grant.module as WeddingModule] = grant.access_level;
    }
  }

  const role = membership.role as MemberRole;
  const isOwner = role === "owner" || role === "co_owner";
  const actualLevel = isOwner ? "edit" : role === "read_only_collaborator" ? moduleAccess[module as WeddingModule] === "read" ? "read" : undefined : moduleAccess[module as WeddingModule];
  if (module && (actualLevel === undefined || (required === "edit" && actualLevel !== "edit"))) {
    throw new AuthorizationDeniedError();
  }

  return {
    user,
    displayName: profile?.display_name || user.email || "Wedding member",
    wedding: { id: wedding.id, name: wedding.name, timezone: wedding.timezone, currency: wedding.currency, overall_budget: wedding.overall_budget_text },
    membership: { id: membership.id, role },
    moduleAccess,
  };
}

export async function requireCurrentWorkspace(module?: WeddingModule, required: AccessLevel = "read") {
  try {
    if (!getSupabaseEnvironment()) redirect("/sign-in?reason=configuration");
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) redirect("/sign-in");
    const { data: memberships, error: membershipError } = await supabase
      .from("wedding_members")
      .select("id, wedding_id, role, created_at")
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (membershipError) throw new Error("Could not verify workspace membership.");
    const membership = memberships?.[0];
    if (!membership) redirect("/setup");

    const context = await authorizeWeddingOperation(membership.wedding_id, module, required);
    return context;
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) redirect("/forbidden");
    throw error;
  }
}

