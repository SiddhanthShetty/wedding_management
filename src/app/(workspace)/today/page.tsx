import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getOperationsWorkspace } from "@/lib/data/operations";
import { DayOf } from "@/components/day-of";

export default async function DayOfPage() {
  const workspace = await requireCurrentWorkspace("logistics");
  const data = await getOperationsWorkspace(workspace.wedding.id);
  return <DayOf data={data} />;
}
