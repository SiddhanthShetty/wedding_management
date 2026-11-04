import { SupplierManager } from "@/components/supplier-manager";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { listSupplierAssignees, listWeddingSuppliers } from "@/lib/data/suppliers";

export default async function Page() {
  const workspace = await requireCurrentWorkspace("suppliers_finance");
  const [directory, assignees] = await Promise.all([
    listWeddingSuppliers(workspace.wedding.id),
    listSupplierAssignees(workspace.wedding.id),
  ]);
  return <SupplierManager
    weddingId={workspace.wedding.id}
    currentUserId={workspace.user.id}
    suppliers={directory.suppliers}
    assignees={assignees}
    canEdit={directory.canEdit}
    canPlan={directory.canPlan}
  />;
}
