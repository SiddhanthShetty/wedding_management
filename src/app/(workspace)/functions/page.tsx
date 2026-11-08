import { FunctionManager } from "@/components/function-manager";
import { PageHeading } from "@/components/ui";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { listFunctionTaskArrangements, listWeddingFunctions } from "@/lib/data/functions";
import { getWeddingSetup } from "@/lib/data/weddings";

export default async function Page() {
  const workspace = await requireCurrentWorkspace("planning");
  const [functions, arrangements, setup] = await Promise.all([
    listWeddingFunctions(workspace.wedding.id),
    listFunctionTaskArrangements(workspace.wedding.id),
    getWeddingSetup(workspace.wedding.id).catch(() => null),
  ]);
  const canEdit = workspace.membership.role === "owner"
    || workspace.membership.role === "co_owner"
    || workspace.moduleAccess.planning === "edit";
  return <>
    <PageHeading
      eyebrow="Plan the moments"
      title="Wedding functions"
      description="Your wedding events, from Haldi to Reception, with their dates, times and places."
    />
    <FunctionManager
      weddingId={workspace.wedding.id}
      timezone={workspace.wedding.timezone}
      currency={workspace.wedding.currency}
      functions={functions}
      weddingDate={setup?.wedding_date ?? null}
      arrangements={arrangements}
      canEdit={canEdit}
    />
  </>;
}
