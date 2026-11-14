/**
 * Starter templates and setup progress. Templates only create ordinary records through the normal
 * create paths, so everything they add can be edited or cancelled like anything else.
 */
import { addDaysIso } from "@/lib/planning/dashboard";

export type FunctionTemplate = { name: string; functionType: string; dayOffset: number; startTime: string; endTime: string; dressCode: string };
export const FUNCTION_SETS: Array<{ id: string; name: string; description: string; functions: FunctionTemplate[] }> = [
  {
    id: "mangalorean", name: "Mangalorean / South Indian", description: "Haldi, Mehendi, Sangeet, Muhurtham and Reception around the wedding day.",
    functions: [
      { name: "Haldi (Arishina)", functionType: "Haldi", dayOffset: -1, startTime: "09:00", endTime: "12:00", dressCode: "Yellow traditional" },
      { name: "Mehendi", functionType: "Mehendi", dayOffset: -2, startTime: "16:00", endTime: "20:00", dressCode: "Festive" },
      { name: "Sangeet", functionType: "Sangeet", dayOffset: -1, startTime: "18:30", endTime: "23:00", dressCode: "Festive" },
      { name: "Muhurtham", functionType: "Ceremony", dayOffset: 0, startTime: "09:30", endTime: "13:00", dressCode: "Traditional silk" },
      { name: "Reception", functionType: "Reception", dayOffset: 0, startTime: "19:00", endTime: "23:00", dressCode: "Formal" },
    ],
  },
  {
    id: "simple", name: "Simple two-event wedding", description: "One ceremony and one reception on the wedding day.",
    functions: [
      { name: "Wedding ceremony", functionType: "Ceremony", dayOffset: 0, startTime: "10:00", endTime: "13:00", dressCode: "" },
      { name: "Reception", functionType: "Reception", dayOffset: 0, startTime: "19:00", endTime: "22:30", dressCode: "" },
    ],
  },
];

export type TaskTemplate = { title: string; monthsBefore: number; description: string; priority: "low" | "normal" | "high" };
export const TASK_CHECKLIST: TaskTemplate[] = [
  { title: "Agree the overall budget", monthsBefore: 12, description: "Decide who contributes what and set the overall budget in Settings.", priority: "high" },
  { title: "Shortlist and book the main venue", monthsBefore: 11, description: "Compare venues on Venues & vendors; record quotes before booking.", priority: "high" },
  { title: "Fix the muhurtham date with the family priest", monthsBefore: 11, description: "", priority: "high" },
  { title: "Book the caterer", monthsBefore: 9, description: "Arrange a tasting before confirming the menu.", priority: "high" },
  { title: "Book photographer and videographer", monthsBefore: 9, description: "Share the shot list from Things to arrange.", priority: "normal" },
  { title: "Book nadaswaram / music and decorators", monthsBefore: 8, description: "", priority: "normal" },
  { title: "Draft the guest list", monthsBefore: 7, description: "Add households first, then each person.", priority: "high" },
  { title: "Block hotel rooms for out-of-town guests", monthsBefore: 6, description: "Record nights held on Stays & travel.", priority: "normal" },
  { title: "Order outfits and plan fittings", monthsBefore: 5, description: "", priority: "normal" },
  { title: "Design and share invitations", monthsBefore: 3, description: "Use the Invitations page; set each household's language.", priority: "high" },
  { title: "Plan guest transport", monthsBefore: 2, description: "Collect arrival times and plan pickups.", priority: "normal" },
  { title: "Send RSVP reminders", monthsBefore: 1, description: "Remind everyone who has not replied.", priority: "normal" },
  { title: "Confirm final catering counts", monthsBefore: 0.5, description: "Approve the guarantee with the caterer.", priority: "high" },
  { title: "Finalise run sheets and share with coordinators", monthsBefore: 0.25, description: "Print the operational pack.", priority: "high" },
];

/** Due date = wedding date minus the lead time; never in the past (past items become due today). */
export function templateDueDate(weddingDate: string | null, monthsBefore: number, today: string): string | null {
  if (!weddingDate) return null;
  const due = addDaysIso(weddingDate, -Math.round(monthsBefore * 30.4));
  return due < today ? today : due;
}

export function functionDate(weddingDate: string | null, dayOffset: number): string {
  return weddingDate ? addDaysIso(weddingDate, dayOffset) : "";
}

/** Template items whose name is not already used (case- and space-insensitive), so applying twice adds nothing. */
export function newTemplateItems<T>(items: T[], existingNames: string[], nameOf: (item: T) => string): T[] {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase().replace(/\s+/g, " ")));
  return items.filter((item) => !taken.has(nameOf(item).trim().toLowerCase().replace(/\s+/g, " ")));
}

export type SetupCounts = {
  weddingDetails: boolean; members: number; functions: number | null; guests: number | null; suppliers: number | null; tasks: number | null; designs: number | null;
};
export type SetupStep = { id: string; label: string; done: boolean; href: string; hint: string };

/** Setup checklist. Steps in areas the member cannot read are left out rather than shown as undone. */
export function setupSteps(counts: SetupCounts, isOwner: boolean): SetupStep[] {
  const steps: Array<SetupStep | null> = [
    isOwner ? { id: "details", label: "Add your names, wedding date and budget", done: counts.weddingDetails, href: "/settings", hint: "Used on invitations and for due dates." } : null,
    counts.functions === null ? null : { id: "functions", label: "Add your functions", done: counts.functions > 0, href: "/functions", hint: "Or use a starter set below." },
    isOwner ? { id: "partner", label: "Invite your partner or a family helper", done: counts.members > 1, href: "/settings?tab=people", hint: "Send them the sign-up link, then add their email." } : null,
    counts.guests === null ? null : { id: "guests", label: "Add your families", done: counts.guests > 0, href: "/guests/simple", hint: "Paste them in, one family per line." },
    counts.suppliers === null ? null : { id: "vendors", label: "Shortlist a venue or vendor", done: counts.suppliers > 0, href: "/venues-vendors", hint: "Record quotes as they arrive." },
    counts.tasks === null ? null : { id: "tasks", label: "Plan your tasks", done: counts.tasks > 0, href: "/tasks", hint: "Or add the starter checklist below." },
  ];
  return steps.filter((step): step is SetupStep => step !== null);
}
