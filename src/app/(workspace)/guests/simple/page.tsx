import { GuestDesk } from "@/components/guest-desk";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getInviteDesk } from "@/lib/data/family-invites";

/** Invitations: add families, send each its one link on WhatsApp, and see who has replied. */
export default async function GuestDeskPage() {
  const workspace = await requireCurrentWorkspace("guests");
  const desk = await getInviteDesk(workspace.wedding.id);
  return <GuestDesk desk={desk} />;
}
