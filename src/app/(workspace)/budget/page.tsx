import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getFinanceDashboard } from "@/lib/data/finance";
import { FinanceManager } from "@/components/finance-manager";

export default async function Page() {
  const context = await requireCurrentWorkspace("suppliers_finance");
  const data = await getFinanceDashboard(context.wedding.id);
  return <FinanceManager data={data} weddingId={context.wedding.id} />;
}
