import { GuestManager } from "@/components/guest-manager";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getGuestWorkspace } from "@/lib/data/guests";

export default async function Page() {
  const workspace=await requireCurrentWorkspace("guests");
  const data=await getGuestWorkspace(workspace.wedding.id);
  return <GuestManager data={data}/>;
}
