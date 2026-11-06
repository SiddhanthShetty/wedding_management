import { GuestManager } from "@/components/guest-manager";
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
  return <GuestManager data={data} initialView={view} initialFunctionId={typeof params.function==="string"?params.function:undefined} initialResponse={response}/>;
}
