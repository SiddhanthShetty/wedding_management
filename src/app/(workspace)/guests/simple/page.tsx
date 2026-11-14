import { GuestDesk } from "@/components/guest-desk";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getGuestDesk } from "@/lib/data/guest-desk";

/** The simple guest desk: add families, invite them on WhatsApp, and see who has replied. */
export default async function GuestDeskPage() {
  const workspace = await requireCurrentWorkspace("guests");
  const desk = await getGuestDesk(workspace.wedding.id);
  return <GuestDesk desk={desk} />;
}
