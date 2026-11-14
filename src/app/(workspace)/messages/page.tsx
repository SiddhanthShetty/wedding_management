import { redirect } from "next/navigation";

/** Invitations, reminders and updates are all sent from the Guests page now. */
export default function MessagesPage() {
  redirect("/guests/simple#send-update");
}
