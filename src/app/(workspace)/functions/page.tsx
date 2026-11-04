import { FunctionManager } from "@/components/function-manager";
import { PageHeading } from "@/components/ui";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { listFunctionTaskArrangements, listWeddingFunctions } from "@/lib/data/functions";

export default async function Page() {
  const workspace = await requireCurrentWorkspace("planning");
  const [functions, arrangements] = await Promise.all([
    listWeddingFunctions(workspace.wedding.id),
    listFunctionTaskArrangements(workspace.wedding.id),
  ]);
  const canEdit = workspace.membership.role === "owner"
    || workspace.membership.role === "co_owner"
    || workspace.moduleAccess.planning === "edit";
  return <>
    <PageHeading
      eyebrow="Plan the moments"
      title="Wedding functions"
      description="Create custom functions, start from an editable template, and keep the schedule in your wedding timezone."
    />
    <FunctionManager
      weddingId={workspace.wedding.id}
      timezone={workspace.wedding.timezone}
      currency={workspace.wedding.currency}
      functions={functions}
      arrangements={arrangements}
      canEdit={canEdit}
    />
  </>;
}
