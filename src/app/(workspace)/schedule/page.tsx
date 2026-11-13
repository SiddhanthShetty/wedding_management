import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getOperationsWorkspace } from "@/lib/data/operations";
import { OperationsManager, type OperationsTab } from "@/components/operations-manager";

const tabs: OperationsTab[] = ["timeline", "arrangements"];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("logistics");
  const params = await searchParams;
  const data = await getOperationsWorkspace(workspace.wedding.id);
  // Older links: vendors, coordinators and issues now live on the run sheet.
  const tab = tabs.find((value) => value === params.tab) ?? "timeline";
  const showIssues = params.tab === "issues";
  const functionId = data.functions.find((fn) => fn.id === params.function)?.id ?? null;
  return <OperationsManager data={data} initialTab={tab} initialFunctionId={functionId} tabFromUrl={typeof params.tab === "string" && tabs.some((value) => value === params.tab)} showIssues={showIssues} />;
}
