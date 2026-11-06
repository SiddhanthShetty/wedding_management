import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getCommunicationsWorkspace } from "@/lib/data/communications";
import { MessagesManager } from "@/components/messages-manager";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("guests");
  const params = await searchParams;
  const data = await getCommunicationsWorkspace(workspace.wedding.id);
  const kind = params.kind === "reminder" || params.kind === "invitation" || params.kind === "update" ? params.kind : undefined;
  // `?function=…&kind=reminder` opens straight onto "remind everyone who hasn't replied".
  return <MessagesManager data={data} initialFunctionId={typeof params.function === "string" ? params.function : undefined} initialKind={kind} />;
}
