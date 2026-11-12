import { CalendarHeart, CheckSquare2, LayoutDashboard, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";

export type NavLink = { href: string; label: string; icon: LucideIcon; module?: WeddingModule; area?: AreaId };
export type NavGroup = { id: string; label: string | null; links: NavLink[] };
export type AreaId = "plan" | "guests" | "money" | "week";

/** Pages that belong together share one menu entry and show section tabs at the top. */
export const AREAS: Record<AreaId, Array<{ href: string; label: string }>> = {
  plan: [{ href: "/tasks", label: "To do" }, { href: "/decisions", label: "To decide" }, { href: "/functions", label: "Functions" }],
  guests: [{ href: "/guests", label: "People & RSVPs" }, { href: "/invitations", label: "Invitations" }, { href: "/messages", label: "Messages" }],
  money: [{ href: "/venues-vendors", label: "Vendors" }, { href: "/budget", label: "Budget" }],
  week: [{ href: "/schedule", label: "Run sheets" }, { href: "/today", label: "Day-of" }, { href: "/logistics", label: "Catering" }, { href: "/travel", label: "Stays & travel" }],
};

/**
 * Five menu entries, by what people are trying to do. Each opens an area with tabs.
 * Files live on the records they belong to; "All files" is in the account menu.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: "home", label: null, links: [{ href: "/overview", label: "Home", icon: LayoutDashboard }] },
  { id: "plan", label: null, links: [{ href: "/tasks", label: "Plan", icon: CheckSquare2, module: "planning", area: "plan" }] },
  { id: "guests", label: null, links: [{ href: "/guests", label: "Guests", icon: UsersRound, module: "guests", area: "guests" }] },
  { id: "money", label: null, links: [{ href: "/venues-vendors", label: "Money", icon: Wallet, module: "suppliers_finance", area: "money" }] },
  { id: "week", label: null, links: [{ href: "/schedule", label: "Wedding week", icon: CalendarHeart, module: "logistics", area: "week" }] },
];

/** Groups and links this member can open. Groups with no visible links are dropped. Hiding is a convenience; the server still enforces access. */
export function visibleNavGroups(role: MemberRole, moduleAccess: Partial<Record<WeddingModule, AccessLevel>>, groups = NAV_GROUPS): NavGroup[] {
  const isOwner = role === "owner" || role === "co_owner";
  return groups
    .map((group) => ({ ...group, links: group.links.filter((link) => !link.module || isOwner || Boolean(moduleAccess[link.module])) }))
    .filter((group) => group.links.length > 0);
}

const matchesPath = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function areaForPath(pathname: string): AreaId | null {
  for (const [id, tabs] of Object.entries(AREAS) as Array<[AreaId, Array<{ href: string }>]>) if (tabs.some((tab) => matchesPath(pathname, tab.href))) return id;
  return null;
}

export function isActiveLink(pathname: string, link: string | NavLink) {
  if (typeof link !== "string" && link.area) return areaForPath(pathname) === link.area;
  return matchesPath(pathname, typeof link === "string" ? link : link.href);
}

export function currentSectionLabel(pathname: string) {
  for (const tabs of Object.values(AREAS)) for (const tab of tabs) if (matchesPath(pathname, tab.href)) return tab.label;
  for (const group of NAV_GROUPS) for (const link of group.links) if (matchesPath(pathname, link.href)) return link.label;
  if (pathname === "/settings") return "Settings";
  if (pathname === "/documents") return "All files";
  if (pathname === "/search") return "Search";
  if (pathname === "/design-system") return "Design system";
  return "Home";
}
