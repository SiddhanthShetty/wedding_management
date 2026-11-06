import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getCommunicationsWorkspace } from "@/lib/data/communications";
import { MessagesManager } from "@/components/messages-manager";

export default async function MessagesPage() {
  const workspace = await requireCurrentWorkspace("guests");
  const data = await getCommunicationsWorkspace(workspace.wedding.id);
  return <MessagesManager data={data} />;
}
