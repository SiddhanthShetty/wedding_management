import { WorkspaceShell } from "@/components/workspace-shell";
import { requireCurrentWorkspace } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const workspace = await requireCurrentWorkspace();
  return <WorkspaceShell weddingName={workspace.wedding.name} displayName={workspace.displayName} role={workspace.membership.role} moduleAccess={workspace.moduleAccess}>{children}</WorkspaceShell>;
}
