import "server-only";
import { authorizeWeddingOperation, type WeddingModule, type WorkspaceContext } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWeddingFunction, listWeddingFunctions } from "@/lib/data/functions";
import { createWeddingTask, listWeddingTasks } from "@/lib/data/tasks";
import { saveTemplate } from "@/lib/data/communications";
import { instantToLocalDate } from "@/lib/planning/local-time";
import { FUNCTION_SETS, functionDate, newTemplateItems, TASK_CHECKLIST, templateDueDate, type SetupCounts } from "@/lib/planning/starter-templates";

const canRead = (context: WorkspaceContext, module: WeddingModule) => context.membership.role === "owner" || context.membership.role === "co_owner" || Boolean(context.moduleAccess[module]);
const canEdit = (context: WorkspaceContext, module: WeddingModule) => context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess[module] === "edit";

/** Lightweight counts for the setup checklist. Areas the member cannot read are null (left out of the list). */
export async function getSetupState(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId);
  const supabase = await createSupabaseServerClient();
  const count = async (table: string, module: WeddingModule) => {
    if (!canRead(context, module)) return null;
    const { count: total, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("wedding_id", weddingId);
    if (error) throw new Error("Could not load setup progress.");
    return total ?? 0;
  };
  const [wedding, members, functions, guests, suppliers, tasks, designs] = await Promise.all([
    supabase.from("weddings").select("partner_one_display_name,partner_two_display_name,wedding_date,overall_budget").eq("id", weddingId).maybeSingle(),
    supabase.from("wedding_members").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId).eq("status", "active"),
    count("functions", "planning"), count("guests", "guests"), count("suppliers", "suppliers_finance"), count("tasks", "planning"), count("invitation_designs", "guests"),
  ]);
  if (wedding.error || members.error) throw new Error("Could not load setup progress.");
  const counts: SetupCounts = {
    weddingDetails: Boolean(wedding.data?.partner_one_display_name && wedding.data?.partner_two_display_name && wedding.data?.wedding_date && wedding.data?.overall_budget !== null),
    members: members.count ?? 1, functions, guests, suppliers, tasks, designs,
  };
  return {
    counts,
    weddingDate: (wedding.data?.wedding_date as string | null) ?? null,
    isOwner: context.membership.role === "owner" || context.membership.role === "co_owner",
    canAddFunctions: canEdit(context, "planning"),
    canAddTasks: canEdit(context, "planning"),
  };
}

async function weddingDate(weddingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("weddings").select("wedding_date").eq("id", weddingId).maybeSingle();
  if (error) throw new Error("Could not load the wedding date.");
  return (data?.wedding_date as string | null) ?? null;
}

/** Adds a starter set of functions, skipping any name already used. Dates follow the wedding date when set. */
export async function applyFunctionSet(weddingId: string, setId: string) {
  await authorizeWeddingOperation(weddingId, "planning", "edit");
  const set = FUNCTION_SETS.find((item) => item.id === setId);
  if (!set) throw new Error("Unknown starter set.");
  const date = await weddingDate(weddingId);
  const existing = await listWeddingFunctions(weddingId);
  const toAdd = newTemplateItems(set.functions, existing.filter((fn) => !fn.archived_at).map((fn) => fn.name), (item) => item.name);
  for (const fn of toAdd) {
    const day = functionDate(date, fn.dayOffset);
    await createWeddingFunction(weddingId, {
      name: fn.name, functionType: fn.functionType, functionDate: day, startTime: day ? fn.startTime : "", endTime: day ? fn.endTime : "",
      venueName: "", guestMapUrl: "", status: "tentative", expectedAttendance: "", budgetAllocation: "", coordinatorName: "", dressCode: fn.dressCode, notes: "Added from a starter set. Edit freely.",
    });
  }
  return { added: toAdd.length, skipped: set.functions.length - toAdd.length, dated: Boolean(date) };
}

/**
 * Adds the starter task checklist with due dates counted back from the wedding date.
 * With `titles`, only those checklist items are added (anything else in the list is ignored).
 */
export async function applyTaskChecklist(weddingId: string, titles?: string[]) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const date = await weddingDate(weddingId);
  const today = instantToLocalDate(new Date(), context.wedding.timezone);
  const existing = await listWeddingTasks(weddingId);
  const picked = titles ? TASK_CHECKLIST.filter((item) => titles.includes(item.title)) : TASK_CHECKLIST;
  const toAdd = newTemplateItems(picked, existing.map((task) => task.title), (item) => item.title);
  for (const task of toAdd) {
    await createWeddingTask(weddingId, {
      title: task.title, description: task.description, functionId: "", ownerUserId: "", dueDate: templateDueDate(date, task.monthsBefore, today) ?? "",
      priority: task.priority, status: "not_started", relatedVendorReference: "", relatedBookingReference: "", dependsOnTaskId: "",
    });
  }
  return { added: toAdd.length, skipped: picked.length - toAdd.length, dated: Boolean(date) };
}

/** A ready-made RSVP reminder template for the Messages page. */
export async function addStarterReminderTemplate(weddingId: string) {
  await saveTemplate(weddingId, null, null, {
    kind: "reminder", name: "Friendly RSVP reminder", function_id: null, subject: "A gentle reminder from {{couple_names}}",
    body: "Hi {{first_name}}, a gentle reminder to let {{couple_names}} know whether you can join us for {{function_name}} on {{function_date}}. You can reply using your private invitation link. Thank you!",
  });
}
