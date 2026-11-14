import { redirect } from "next/navigation";

/** Invitations now live on the Guest desk; old bookmarks and links land there. */
export default function InvitationsPage() {
  redirect("/guests/simple");
}
