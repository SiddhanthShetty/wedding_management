/**
 * Plain names for wedding roles and areas. The database keeps its own role names; these are only
 * what people see. Access is still enforced by the database for every role.
 */
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";

export const ROLE_NAMES: Record<MemberRole, string> = {
  owner: "Partner",
  co_owner: "Partner",
  scoped_collaborator: "Family helper",
  read_only_collaborator: "View only",
};

/** The three choices offered when adding someone. */
export type PlainRole = "partner" | "helper" | "view";
export const PLAIN_ROLES: Array<{ id: PlainRole; role: MemberRole; name: string; description: string }> = [
  { id: "partner", role: "co_owner", name: "Partner", description: "Sees and changes everything, including Settings and who can help." },
  { id: "helper", role: "scoped_collaborator", name: "Family helper", description: "Helps with the parts you choose, like guests or the wedding week." },
  { id: "view", role: "read_only_collaborator", name: "View only", description: "Can look at the parts you choose but not change anything." },
];

/** Menu areas, in the same words as the menu. */
export const AREA_NAMES: Record<WeddingModule, string> = {
  planning: "Plan (tasks, decisions, functions)",
  guests: "Guests and invitations",
  suppliers_finance: "Money (vendors and budget)",
  logistics: "Wedding week",
};
export const AREA_ORDER: WeddingModule[] = ["planning", "guests", "suppliers_finance", "logistics"];

/** Sensible starting access for each kind of helper. */
export const DEFAULT_ACCESS: Record<Exclude<PlainRole, "partner">, Record<WeddingModule, AccessLevel | "none">> = {
  helper: { planning: "edit", guests: "edit", suppliers_finance: "none", logistics: "edit" },
  view: { planning: "read", guests: "read", suppliers_finance: "none", logistics: "read" },
};

export function roleName(role: MemberRole): string {
  return ROLE_NAMES[role] ?? "Member";
}

/** For example "Can change: Plan, Guests · Can see: Wedding week", or "Everything" for partners. */
export function accessSummary(role: MemberRole, access: Partial<Record<WeddingModule, AccessLevel>>): string {
  if (role === "owner" || role === "co_owner") return "Everything";
  const short: Record<WeddingModule, string> = { planning: "Plan", guests: "Guests", suppliers_finance: "Money", logistics: "Wedding week" };
  const change = AREA_ORDER.filter((area) => access[area] === "edit").map((area) => short[area]);
  const see = AREA_ORDER.filter((area) => access[area] === "read").map((area) => short[area]);
  const parts = [change.length ? `Can change: ${change.join(", ")}` : "", see.length ? `Can see: ${see.join(", ")}` : ""].filter(Boolean);
  return parts.join(" · ") || "Nothing yet";
}

/** True when only one partner is in the wedding, so the "Invite your partner" card should show. */
export function needsPartner(members: Array<{ role: MemberRole; status: string }>): boolean {
  return members.filter((member) => member.status === "active" && (member.role === "owner" || member.role === "co_owner")).length < 2;
}

/** The message a partner is sent (by the couple themselves) to create their account. */
export function partnerInviteMessage(signUpUrl: string, inviterName: string): string {
  return `Hi! I've set up our wedding planner. Please create your own account here: ${signUpUrl}\n\nConfirm your email, then tell me the email you used and I'll add you. Don't set up a new wedding when it asks. — ${inviterName}`;
}
