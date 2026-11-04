import { GuestPortal } from "@/components/guest-portal";
import { getGuestPortalData } from "@/lib/guest-portal/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GuestPortalPage() {
  const data = await getGuestPortalData();
  return <GuestPortal data={data} />;
}
