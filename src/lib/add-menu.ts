import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";

export type AddItem = { label: string; hint: string; href: string; module: WeddingModule | null };

/** Everything the "+ Add" button can start, each opening the right form on its page. */
export const ADD_ITEMS: AddItem[] = [
  { label: "Task", hint: "Something to do", href: "/tasks?add=1", module: "planning" },
  { label: "Family", hint: "A household of guests", href: "/guests?add=household", module: "guests" },
  { label: "Guest", hint: "One person", href: "/guests?add=guest", module: "guests" },
  { label: "Venue or vendor", hint: "Someone you're considering", href: "/venues-vendors?add=1", module: "suppliers_finance" },
  { label: "Cost", hint: "A booking or an estimate", href: "/budget?add=cost", module: "suppliers_finance" },
  { label: "Payment", hint: "Money you've paid", href: "/budget?add=payment", module: "suppliers_finance" },
  { label: "Function", hint: "Haldi, Sangeet and so on", href: "/functions?add=1", module: "planning" },
  { label: "File", hint: "A contract, quote or photo", href: "/documents", module: null },
];

/** Only what this member can change. The server still checks every save. */
export function addItemsFor(role: MemberRole, moduleAccess: Partial<Record<WeddingModule, AccessLevel>>): AddItem[] {
  const owner = role === "owner" || role === "co_owner";
  return ADD_ITEMS.filter((item) => !item.module || owner || moduleAccess[item.module] === "edit");
}
