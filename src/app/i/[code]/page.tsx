import { InvitationNotFound, InvitationView } from "@/components/invite/InvitationView";
import { getFamilyInvitation } from "@/lib/family-invites/public";

export default async function FamilyInvitationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invitation = await getFamilyInvitation(code);
  return invitation ? <InvitationView code={code} invitation={invitation} /> : <InvitationNotFound />;
}
