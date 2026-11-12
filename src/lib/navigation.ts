import { CalendarDays, CalendarHeart, CheckSquare2, FileText, LayoutDashboard, Map, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";

export type NavLink = { href: string; label: string; icon: LucideIcon; module?: WeddingModule; area?: AreaId };
export type NavGroup = { id: string; label: string | null; links: NavLink[] };
export type AreaId = "plan" | "guests" | "week";

/** Pages that belong together share one sidebar entry and show section tabs at the top. */
export const AREAS: Record<AreaId, Array<{ href: string; label: string }>> = {
  plan: [{ href: "/tasks", label: "To do" }, { href: "/decisions", label: "To decide" }],
  guests: [{ href: "/guests", label: "People & RSVPs" }, { href: "/invitations", label: "Invitations" }, { href: "/messages", label: "Messages" }],
  week: [{ href: "/schedule", label: "Run sheets" }, { href: "/today", label: "Day-of" }, { href: "/logistics", label: "Catering" }, { href: "/travel", label: "Stays & travel" }],
};

/** Navigation grouped by what people are trying to do, not by database module. */
export const NAV_GROUPS: NavGroup[] = [
  { id: "home", label: null, links: [{ href: "/overview", label: "Overview", icon: LayoutDashboard }] },
  { id: "plan", label: "Plan", links: [
    { href: "/functions", label: "Functions", icon: CalendarDays, module: "planning" },
    { href: "/tasks", label: "Tasks", icon: CheckSquare2, module: "planning", area: "plan" },
  ] },
  { id: "guests", label: null, links: [{ href: "/guests", label: "Guests", icon: UsersRound, module: "guests", area: "guests" }] },
  { id: "money", label: "Money", links: [
    { href: "/venues-vendors", label: "Venues & vendors", icon: Map, module: "suppliers_finance" },
    { href: "/budget", label: "Budget & payments", icon: Wallet, module: "suppliers_finance" },
  ] },
  { id: "week", label: null, links: [{ href: "/schedule", label: "Wedding week", icon: CalendarHeart, module: "logistics", area: "week" }] },
  { id: "files", label: null, links: [{ href: "/documents", label: "Documents", icon: FileText }] },
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
  if (pathname === "/design-system") return "Design system";
  return "Overview";
}
