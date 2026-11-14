import { redirect } from "next/navigation";

/** Families and the people in them now live on the Guests page (Family details and people). */
export default function PeoplePage() {
  redirect("/guests/simple");
}
