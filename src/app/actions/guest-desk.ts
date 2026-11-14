"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { addFamilies, GuestDeskRuleError, prepareFamilyLink, recordReminder, setFamilyInvited, type CreatedFamily } from "@/lib/data/guest-desk";
import { databaseProblem, parseFamilyLines, problemText } from "@/lib/planning/family-paste";

export type AddFamiliesState = { problems?: string[]; error?: string; message?: string; created?: CreatedFamily[]; at?: number };

const id = z.uuid();
const NO_ACCESS = "You can no longer change this. Refresh the page, and ask the couple if it keeps happening.";

function failure(error: unknown, fallback: string) {
  if (error instanceof AuthorizationDeniedError) return NO_ACCESS;
  if (error instanceof GuestDeskRuleError) return error.message;
  if (error instanceof Error && error.message.startsWith("Could not create this guest's private link")) return error.message;
  return fallback;
}

async function refresh() { revalidatePath("/guests/simple"); revalidatePath("/guests"); revalidatePath("/invitations"); revalidatePath("/messages"); revalidatePath("/overview"); }

/** The paste box. All or nothing: any problem means nothing is added, and every problem is listed. */
export async function addFamiliesAction(_state: AddFamiliesState, form: FormData): Promise<AddFamiliesState> {
  const parsed = z.object({
    weddingId: id,
    text: z.string().max(40_000, "That's too much text at once. Paste up to 100 families."),
    functionIds: z.array(id).max(50),
    familySide: z.enum(["couple_one", "couple_two", "shared", "unknown"]),
    language: z.enum(["en", "hi", "kn", "tcy"]),
  }).safeParse({
    weddingId: form.get("weddingId"), text: form.get("families") ?? "",
    functionIds: form.getAll("inviteTo").filter((value) => typeof value === "string"),
    familySide: form.get("familySide") || "unknown", language: form.get("language") || "en",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message.startsWith("That's") ? parsed.error.issues[0].message : "Something went wrong with this page. Refresh it and try again.", at: Date.now() };
  const { families, problems } = parseFamilyLines(parsed.data.text);
  const listed = problems.map(problemText);
  if (!parsed.data.functionIds.length) listed.push("Choose at least one function to invite them to.");
  if (listed.length) return { problems: listed, at: Date.now() };
  try {
    const result = await addFamilies(parsed.data.weddingId, families, parsed.data);
    if (result.status === "invalid") {
      return { problems: result.errors.map((row) => problemText({ line: families[row.index]!.line, name: families[row.index]!.name, message: databaseProblem(row.code) })), at: Date.now() };
    }
    await refresh();
    const people = result.created.reduce((total, row) => total + row.people, 0);
    return { created: result.created, message: `Added ${result.created.length} ${result.created.length === 1 ? "family" : "families"} (${people} ${people === 1 ? "person" : "people"}).`, at: Date.now() };
  } catch (error) {
    if (error instanceof Error && /Choose functions/.test(error.message)) return { problems: ["A function you chose was cancelled or archived. Refresh the page and choose again."], at: Date.now() };
    return { error: failure(error, "Couldn't add these families. Nothing was saved; refresh and try again."), at: Date.now() };
  }
}

/** A new family link for "Invite on WhatsApp" or "Send a fresh link". The token is returned once and never stored. */
export async function prepareFamilyInviteAction(weddingId: string, householdId: string): Promise<{ token?: string; expiresAt?: string; leadGuestId?: string; error?: string }> {
  if (!id.safeParse(weddingId).success || !id.safeParse(householdId).success) return { error: "Something went wrong with this page. Refresh it and try again." };
  try {
    const link = await prepareFamilyLink(weddingId, householdId);
    revalidatePath("/guests/simple");
    return { token: link.token, expiresAt: link.expiresAt, leadGuestId: link.leadGuestId };
  } catch (error) { return { error: failure(error, "Couldn't make the link. Nothing was changed; refresh and try again.") }; }
}

export async function recordFamilyReminderAction(input: { weddingId: string; guestId: string; message: string; link: string }): Promise<{ message?: string; error?: string }> {
  const parsed = z.object({ weddingId: id, guestId: id, message: z.string().min(1).max(8000), link: z.string().max(500) }).safeParse(input);
  if (!parsed.success) return { error: "Could not record this reminder." };
  try {
    const result = await recordReminder(parsed.data.weddingId, parsed.data);
    await refresh();
    return { message: result.recorded ? "Reminder recorded. Delivery isn't confirmed." : "A reminder was already recorded for this family today." };
  } catch (error) { return { error: failure(error, "Could not record this reminder. Nothing was saved.") }; }
}

export async function setFamilyInvitedAction(weddingId: string, householdId: string, invited: boolean): Promise<{ message?: string; error?: string }> {
  if (!id.safeParse(weddingId).success || !id.safeParse(householdId).success || typeof invited !== "boolean") return { error: "Something went wrong with this page. Refresh it and try again." };
  try {
    const count = await setFamilyInvited(weddingId, householdId, invited);
    await refresh();
    return { message: invited ? `Put back: ${count} invitation${count === 1 ? "" : "s"} are active again. Send them a new link.` : "Removed from the list. Their replies are kept, and their link no longer works." };
  } catch (error) { return { error: failure(error, invited ? "Couldn't put this family back. Nothing was changed." : "Couldn't remove this family. Nothing was changed.") }; }
}
