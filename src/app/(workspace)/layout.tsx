import { cookies } from "next/headers";
import { WorkspaceShell } from "@/components/workspace-shell";
import { LOOK_COOKIE } from "@/lib/soft-look";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getWorkspaceBranding } from "@/lib/data/branding";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const workspace = await requireCurrentWorkspace();
  const branding = await getWorkspaceBranding(workspace.wedding.id);
  // Read on the server so the chosen look is there on first paint, with no flash.
  const look = (await cookies()).get(LOOK_COOKIE)?.value === "soft" ? "soft" : "classic";
  return <WorkspaceShell weddingName={workspace.wedding.name} displayName={workspace.displayName} role={workspace.membership.role} moduleAccess={workspace.moduleAccess} branding={branding} look={look}>{children}</WorkspaceShell>;
}
