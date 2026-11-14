"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { addFamilies, familyCode, FamilyInviteRuleError, recordFamilyReply, recordFamilySend, setFamilyRemoved, updateFamily } from "@/lib/data/family-invites";
import { databaseProblem, parseFamilyLines, problemText } from "@/lib/planning/family-paste";

export type AddFamiliesState = { problems?: string[]; error?: string; message?: string; at?: number };
type Result = { message?: string; error?: string };

const id = z.uuid();
const NO_ACCESS = "You can no longer change this. Refresh the page, and ask the couple if it keeps happening.";
const BROKEN = "Something went wrong with this page. Refresh it and try again.";

function failure(error: unknown, fallback: string) {
  if (error instanceof AuthorizationDeniedError) return NO_ACCESS;
  if (error instanceof FamilyInviteRuleError) return error.message;
  return fallback;
}

async function refresh() { for (const path of ["/guests/simple", "/guests", "/messages", "/overview", "/logistics"]) revalidatePath(path); }

/** The paste box. All or nothing: any problem means nothing is added, and every problem is listed. */
export async function addFamiliesAction(_state: AddFamiliesState, form: FormData): Promise<AddFamiliesState> {
  const parsed = z.object({
    weddingId: id,
    text: z.string().max(40_000),
    functionIds: z.array(id).max(50),
    familySide: z.enum(["couple_one", "couple_two", "shared", "unknown"]),
  }).safeParse({
    weddingId: form.get("weddingId"), text: form.get("families") ?? "",
    functionIds: form.getAll("inviteTo").filter((value) => typeof value === "string"),
    familySide: form.get("familySide") || "unknown",
  });
  if (!parsed.success) return { error: parsed.error.issues.some((issue) => issue.path[0] === "text") ? "That's too much text at once. Paste up to 100 families." : BROKEN, at: Date.now() };
  const { families, problems } = parseFamilyLines(parsed.data.text);
  const listed = problems.map(problemText);
  if (!parsed.data.functionIds.length) listed.push("Choose at least one event to invite them to.");
  if (listed.length) return { problems: listed, at: Date.now() };
  try {
    const result = await addFamilies(parsed.data.weddingId, families, parsed.data);
    if (result.status === "invalid") return { problems: result.errors.map((row) => problemText({ line: families[row.index]!.line, name: families[row.index]!.name, message: databaseProblem(row.code) })), at: Date.now() };
    await refresh();
    return { message: `Added ${result.added} ${result.added === 1 ? "family" : "families"}. Tap “Invite” next to each one to send their link.`, at: Date.now() };
  } catch (error) {
    if (error instanceof FamilyInviteRuleError && /still on/.test(error.message)) return { problems: ["An event you chose was cancelled or archived. Refresh the page and choose again."], at: Date.now() };
    return { error: failure(error, "Couldn't add these families. Nothing was saved; refresh and try again."), at: Date.now() };
  }
}

/** The family's link code, making one if needed. With replace, the old link stops working. */
export async function familyCodeAction(weddingId: string, householdId: string, replace: boolean): Promise<{ code?: string; error?: string }> {
  if (!id.safeParse(weddingId).success || !id.safeParse(householdId).success) return { error: BROKEN };
  try {
    const code = await familyCode(weddingId, householdId, replace === true);
    revalidatePath("/guests/simple");
    return { code };
  } catch (error) { return { error: failure(error, "Couldn't make the link. Nothing was changed; refresh and try again.") }; }
}

export async function recordFamilySendAction(input: { weddingId: string; householdId: string; kind: "invite" | "remind"; message: string; link: string }): Promise<Result> {
  const parsed = z.object({ weddingId: id, householdId: id, kind: z.enum(["invite", "remind"]), message: z.string().min(1).max(8000), link: z.string().max(500) }).safeParse(input);
  if (!parsed.success) return { error: "Could not record this." };
  try {
    const result = await recordFamilySend(parsed.data.weddingId, parsed.data);
    await refresh();
    const what = parsed.data.kind === "invite" ? "Invitation" : "Reminder";
    return { message: result.recorded ? `${what} recorded as sent by you.` : `${what} was already recorded for this family today.` };
  } catch (error) { return { error: failure(error, "Could not record this. Nothing was saved.") }; }
}

export async function updateFamilyAction(weddingId: string, householdId: string, maxGuests: number | null, functionIds: string[]): Promise<Result> {
  const parsed = z.object({ weddingId: id, householdId: id, maxGuests: z.number().int().min(1).max(20).nullable(), functionIds: z.array(id).min(1, "Choose at least one event.").max(50) }).safeParse({ weddingId, householdId, maxGuests, functionIds });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? BROKEN };
  try { await updateFamily(weddingId, householdId, parsed.data.maxGuests, parsed.data.functionIds); await refresh(); return { message: "Saved." }; }
  catch (error) { return { error: failure(error, "Couldn't save these changes. Nothing was changed.") }; }
}

export async function setFamilyRemovedAction(weddingId: string, householdId: string, removed: boolean): Promise<Result> {
  if (!id.safeParse(weddingId).success || !id.safeParse(householdId).success || typeof removed !== "boolean") return { error: BROKEN };
  try {
    await setFamilyRemoved(weddingId, householdId, removed);
    await refresh();
    return { message: removed ? "Removed from the list. Their link no longer works, and their reply is kept." : "Put back. Their link works again." };
  } catch (error) { return { error: failure(error, "Couldn't change this family. Nothing was changed.") }; }
}

/** A reply the planner got by phone or in person. */
export async function recordFamilyReplyAction(input: { weddingId: string; householdId: string; attending: boolean; guestCount: number; functionIds: string[]; dietary: string; message: string }): Promise<Result> {
  const parsed = z.object({ weddingId: id, householdId: id, attending: z.boolean(), guestCount: z.number().int().min(0).max(20), functionIds: z.array(id).max(50), dietary: z.enum(["none", "vegetarian", "non-vegetarian", "jain", "vegan", "other"]), message: z.string().max(1000) }).safeParse(input);
  if (!parsed.success) return { error: "Check the reply and try again." };
  try {
    const result = await recordFamilyReply(parsed.data.weddingId, parsed.data.householdId, parsed.data);
    if (result.status !== "saved") return { error: result.field === "guestCount" ? "Choose how many are coming." : result.field === "events" ? "Choose at least one of their events." : "Check the reply and try again." };
    await refresh();
    return { message: "Reply saved." };
  } catch (error) { return { error: failure(error, "Couldn't save this reply. Nothing was changed.") }; }
}
