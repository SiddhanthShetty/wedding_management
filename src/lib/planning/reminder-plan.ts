/**
 * Ready-made messages and a suggested reminder plan, counted back from the wedding date.
 * The plan only suggests dates; nothing is sent automatically.
 */
import type { MessageKind } from "@/lib/planning/communications";

export type ReadyMessage = { key: string; kind: MessageKind; name: string; subject: string; body: string; description: string };

export const READY_MESSAGES: ReadyMessage[] = [
  {
    key: "gentle", kind: "reminder", name: "Friendly RSVP reminder", subject: "A gentle reminder from {{couple_names}}",
    body: "Hi {{first_name}}, a gentle reminder to let {{couple_names}} know whether you can join us for {{function_name}} on {{function_date}}. You can reply using your private invitation link. Thank you!",
    description: "For anyone who hasn't replied, about four weeks before.",
  },
  {
    key: "final", kind: "reminder", name: "Last call before final numbers", subject: "Can you join us? {{couple_names}}",
    body: "Hi {{first_name}}, we're giving the caterer our final numbers for {{function_name}} ({{function_date}}) this week. Could you reply on your private invitation link, or just message us here? Thank you!",
    description: "A last reminder, about two weeks before, before you confirm catering numbers.",
  },
  {
    key: "directions", kind: "update", name: "Directions and timings", subject: "See you at {{function_name}}",
    body: "Hi {{first_name}}, we can't wait to see you at {{function_name}} on {{function_date}} at {{function_time}}, {{venue}}. Your private invitation link has the map and your plan for the day.",
    description: "A few days before, for everyone coming.",
  },
];

export type PlanStep = { key: string; title: string; detail: string; date: string; state: "done" | "now" | "upcoming"; href: string; action: string };

function addDays(date: string, days: number) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * Four steps before the wedding. A step is "now" from its date until the next step's date,
 * "done" after that (meaning its time has passed, not that it was sent), and "upcoming" before.
 */
export function reminderPlan(weddingDate: string | null, today: string, reminderFunctionId: string | null): PlanStep[] {
  if (!weddingDate) return [];
  const remind = reminderFunctionId ? `/messages?function=${reminderFunctionId}&kind=reminder` : "/messages?kind=reminder";
  const steps = [
    { key: "invite", days: -56, title: "Send the invitations", detail: "About 8 weeks before. Each family gets its own link.", href: "/guests/simple", action: "Open Invitations" },
    { key: "gentle", days: -28, title: "Gentle reminder", detail: "About 4 weeks before, to anyone who hasn't replied.", href: remind, action: "Prepare reminders" },
    { key: "final", days: -14, title: "Last call", detail: "About 2 weeks before, so you can give the caterer final numbers.", href: remind, action: "Prepare reminders" },
    { key: "directions", days: -3, title: "Directions and timings", detail: "A few days before, for everyone coming.", href: "/messages?kind=update", action: "Prepare the message" },
  ].map((step) => ({ ...step, date: addDays(weddingDate, step.days) }));
  return steps.map((step, index) => {
    const next = steps[index + 1]?.date ?? weddingDate;
    const state: PlanStep["state"] = today < step.date ? "upcoming" : today < next ? "now" : "done";
    return { key: step.key, title: step.title, detail: step.detail, date: step.date, state, href: step.href, action: step.action };
  });
}
