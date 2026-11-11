"use server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { allocateHousehold, completeTasks, createMissingGuestLinks, inviteHousehold } from "@/lib/data/bulk";
import { TravelRuleError } from "@/lib/data/travel";

export type BulkActionState = { error?: string; message?: string; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };
const all = (form: FormData, key: string) => form.getAll(key).filter((value): value is string => typeof value === "string" && value.length > 0);
const id = z.uuid();

function failure(error: unknown, area: string): BulkActionState {
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the selection." };
  if (error instanceof TravelRuleError) return { error: error.message };
  if (error instanceof AuthorizationDeniedError) return { error: "You can't change this. Ask the couple if you need something changed." };
  if (error instanceof Error && /^(Could not save all invitation changes|Could not create this guest's private link|Assign a household to every invited guest)/.test(error.message)) return { error: error.message };
  return { error: "Nothing was changed. Refresh and try again." };
}

export async function inviteHouseholdAction(_state: BulkActionState, form: FormData): Promise<BulkActionState> {
  try {
    const weddingId = id.parse(text(form, "weddingId"));
    const householdId = id.parse(text(form, "householdId"));
    const functionIds = z.array(id).min(1, "Choose at least one function.").max(30).parse(all(form, "functionIds"));
    const result = await inviteHousehold(weddingId, householdId, functionIds);
    revalidatePath("/guests"); revalidatePath("/invitations"); revalidatePath("/overview");
    return { message: result.invited ? `Added ${result.invited} invitation(s) for ${result.people} person(s). Existing invitations were left as they were.` : "Everyone in this household is already invited to those functions.", at: Date.now() };
  } catch (error) { return failure(error, "guest-list"); }
}

export async function allocateHouseholdAction(_state: BulkActionState, form: FormData): Promise<BulkActionState> {
  try {
    const weddingId = id.parse(text(form, "weddingId"));
    const input = z.object({
      householdId: id, roomIds: z.array(id).min(1, "Choose at least one room.").max(20), checkIn: z.iso.date("Choose a check-in date."), checkOut: z.iso.date("Choose a check-out date."),
      status: z.enum(["proposed", "confirmed"]), payment: z.enum(["unknown", "couple", "guest", "family", "shared"]),
    }).parse({ householdId: text(form, "householdId"), roomIds: all(form, "roomIds"), checkIn: text(form, "checkIn"), checkOut: text(form, "checkOut"), status: text(form, "status") || "proposed", payment: text(form, "payment") || "unknown" });
    const result = await allocateHousehold(weddingId, input);
    revalidatePath("/travel"); revalidatePath("/overview");
    if (result.failed.length) return { error: `${result.placed} placed. Not placed: ${result.failed.join(" ")}`, at: Date.now() };
    return { message: `${result.placed} guest(s) placed.`, at: Date.now() };
  } catch (error) { return failure(error, "logistics"); }
}

export async function completeTasksAction(_state: BulkActionState, form: FormData): Promise<BulkActionState> {
  try {
    const weddingId = id.parse(text(form, "weddingId"));
    const tasks = z.array(z.object({ id, version: z.number().int().positive() })).min(1, "Select at least one task.").max(200)
      .parse(all(form, "task").map((value) => { const [taskId, version] = value.split(":"); return { id: taskId, version: Number(version) }; }));
    const result = await completeTasks(weddingId, tasks);
    revalidatePath("/tasks"); revalidatePath("/overview");
    if (result.conflicts) return { error: `${result.done} marked done. ${result.conflicts} changed since you loaded the list and were left alone; refresh to review them.`, at: Date.now() };
    return { message: `${result.done} task(s) marked done.`, at: Date.now() };
  } catch (error) { return failure(error, "planning"); }
}

/** Returns one-time individual tokens to the planner's device; nothing is stored. */
export async function createMissingLinksAction(weddingId: string): Promise<{ links?: Array<{ guestId: string; name: string; householdId: string | null; language: string; email: string; phone: string; token: string }>; error?: string }> {
  try {
    const links = await createMissingGuestLinks(id.parse(weddingId));
    revalidatePath("/guests"); revalidatePath("/invitations");
    return { links };
  } catch (error) { return { error: failure(error, "guest-list").error }; }
}
