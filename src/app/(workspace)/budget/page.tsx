import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getFinanceDashboard } from "@/lib/data/finance";
import { FinanceManager } from "@/components/finance-manager";
import { instantToLocalDate } from "@/lib/planning/local-time";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireCurrentWorkspace("suppliers_finance");
  const params = await searchParams;
  const data = await getFinanceDashboard(context.wedding.id);
  // `?due=30` shows exactly the payments counted by the dashboard's "due in 30 days" figure.
  const dueWithin = params.due === "30" ? { days: 30, today: instantToLocalDate(new Date(), context.wedding.timezone) } : undefined;
  return <FinanceManager data={data} weddingId={context.wedding.id} dueWithin={dueWithin} />;
}
