import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getInvitationWorkspace } from "@/lib/data/invitations";
import { InvitationStudio } from "@/components/invitation-studio";

export default async function InvitationsPage() {
  const workspace = await requireCurrentWorkspace("guests");
  const data = await getInvitationWorkspace(workspace.wedding.id);
  return <InvitationStudio data={data} />;
}
