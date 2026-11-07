import { WorkspaceShell } from "@/components/workspace-shell";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getWorkspaceBranding } from "@/lib/data/branding";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const workspace = await requireCurrentWorkspace();
  const branding = await getWorkspaceBranding(workspace.wedding.id);
  return <WorkspaceShell weddingName={workspace.wedding.name} displayName={workspace.displayName} role={workspace.membership.role} moduleAccess={workspace.moduleAccess} branding={branding}>{children}</WorkspaceShell>;
}
