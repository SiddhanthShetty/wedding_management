import { InvitationNotFound, InvitationView } from "@/components/invite/InvitationView";
import { getFamilyInvitation } from "@/lib/family-invites/public";
import { resolveConfig } from "@/lib/invitation/settings";

export default async function FamilyInvitationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invitation = await getFamilyInvitation(code);
  // Families always see the published wording, never a draft.
  return invitation ? <InvitationView code={code} invitation={invitation} config={resolveConfig(invitation.settings ?? null)} /> : <InvitationNotFound />;
}
