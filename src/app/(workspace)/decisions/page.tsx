import { PageHeading } from "@/components/ui";
import { DecisionManager } from "@/components/decision-manager";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { listWeddingDecisions } from "@/lib/data/decisions";

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const workspace = await requireCurrentWorkspace("planning");
  const decisions = await listWeddingDecisions(workspace.wedding.id);
  const canEdit = workspace.membership.role === "owner"
    || workspace.membership.role === "co_owner"
    || workspace.moduleAccess.planning === "edit";
  return <>
    <PageHeading eyebrow="Choose together" title="Decisions" description="Compare options, record each partner’s preference, and preserve the final choice and reason." />
    <DecisionManager
      weddingId={workspace.wedding.id}
      currentUserId={workspace.user.id}
      currentUserName={workspace.displayName}
      decisions={decisions}
      canEdit={canEdit}
      initialOpenOnly={params.status === "open"}
    />
  </>;
}
