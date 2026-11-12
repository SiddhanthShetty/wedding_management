import { GuestManager } from "@/components/guest-manager";
import { HouseholdInviteForm } from "@/components/household-invite-form";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getGuestWorkspace } from "@/lib/data/guests";

const views = ["households", "people", "invitations", "imports"] as const;
const responses = ["all", "pending", "yes", "no", "maybe", "not_invited"];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace=await requireCurrentWorkspace("guests");
  const params=await searchParams;
  const data=await getGuestWorkspace(workspace.wedding.id);
  const view=views.find((value)=>value===params.view)??"households";
  const response=responses.find((value)=>value===params.response)??"all";
  const activeFunctions=(data.functions as Array<{ id: string; name: string; function_date: string | null; status: string; archived_at: string | null }>).filter((fn)=>!fn.archived_at&&fn.status!=="cancelled");
  return <>
    <GuestManager data={data} initialView={view} initialFunctionId={typeof params.function==="string"?params.function:undefined} initialResponse={response} initialQuery={typeof params.q==="string"?params.q.slice(0,100):""} initialAdd={params.add==="household"||params.add==="guest"?params.add:undefined}/>
    {data.canEdit&&<div className="section-stack" style={{ marginTop: 16 }}><HouseholdInviteForm weddingId={workspace.wedding.id} households={data.households as Array<{ id: string; name: string }>} functions={activeFunctions}/></div>}
  </>;
}
