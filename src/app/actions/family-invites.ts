"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { addFamilies, deleteFamily, familyCode, FamilyInviteRuleError, recordFamilyReply, recordFamilySend, setFamilyRemoved, updateFamily } from "@/lib/data/family-invites";
import { checkFamilyEntries, databaseProblem, MAX_FAMILIES_AT_ONCE, type EntryError, type FamilyEntry } from "@/lib/planning/family-entries";

export type AddFamiliesState = { errors?: EntryError[]; error?: string; message?: string; at?: number };
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

/**
 * The "Add families" form: one row per family (name, phone, most guests). All or nothing: any
 * problem means nothing is added, and each problem is returned against its own box.
 */
export async function addFamiliesAction(_state: AddFamiliesState, form: FormData): Promise<AddFamiliesState> {
  const text = (key: string) => form.getAll(key).map((value) => (typeof value === "string" ? value : ""));
  const [names, phones, guests] = [text("familyName"), text("familyPhone"), text("familyGuests")];
  const parsed = z.object({
    weddingId: id,
    functionIds: z.array(id).max(50),
    familySide: z.enum(["couple_one", "couple_two", "shared", "unknown"]),
  }).safeParse({ weddingId: form.get("weddingId"), functionIds: form.getAll("inviteTo").filter((value) => typeof value === "string"), familySide: form.get("familySide") || "unknown" });
  if (!parsed.success || names.length !== phones.length || names.length !== guests.length || names.length > MAX_FAMILIES_AT_ONCE + 1 || [...names, ...phones, ...guests].some((value) => value.length > 200)) {
    return { error: BROKEN, at: Date.now() };
  }
  const entries: FamilyEntry[] = names.map((name, row) => ({ name, phone: phones[row]!, guests: guests[row]! }));
  const { families, errors } = checkFamilyEntries(entries);
  if (errors.length) return { errors, at: Date.now() };
  if (!parsed.data.functionIds.length) return { error: "Choose at least one event to invite them to.", at: Date.now() };
  try {
    const result = await addFamilies(parsed.data.weddingId, families, parsed.data);
    if (result.status === "invalid") return { errors: result.errors.map((row) => ({ row: families[row.index]!.row, field: "name" as const, message: databaseProblem(row.code) })), at: Date.now() };
    await refresh();
    return { message: `Added ${result.added} ${result.added === 1 ? "family" : "families"}. Tap “Invite” next to each one to send their link.`, at: Date.now() };
  } catch (error) {
    if (error instanceof FamilyInviteRuleError && /still on/.test(error.message)) return { error: "An event you chose was cancelled or archived. Refresh the page and choose again.", at: Date.now() };
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

/** Deletes the family and everyone in it. Nothing is deleted if something still depends on them. */
export async function deleteFamilyAction(weddingId: string, householdId: string): Promise<Result> {
  if (!id.safeParse(weddingId).success || !id.safeParse(householdId).success) return { error: BROKEN };
  try {
    const people = await deleteFamily(weddingId, householdId);
    await refresh(); revalidatePath("/travel");
    return { message: `deleted, with ${people} ${people === 1 ? "person" : "people"}. They are gone from the People tab too.` };
  } catch (error) { return { error: failure(error, "Couldn't delete this family. Nothing was deleted; refresh and try again.") }; }
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
