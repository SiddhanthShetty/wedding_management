"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, ListChecks, Mail, CalendarDays, CheckSquare2, CircleHelp, FileText, Heart, LayoutDashboard, Map, Menu, Settings, UsersRound, UtensilsCrossed, Wallet, X, Scale } from "lucide-react";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";

const mainLinks = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/functions", label: "Functions", icon: CalendarDays, module: "planning" as const },
  { href: "/tasks", label: "Tasks", icon: CheckSquare2, module: "planning" as const },
  { href: "/decisions", label: "Decisions", icon: Scale, module: "planning" as const },
  { href: "/venues-vendors", label: "Venues & Vendors", icon: Map, module: "suppliers_finance" as const },
  { href: "/budget", label: "Budget", icon: Wallet, module: "suppliers_finance" as const },
  { href: "/guests", label: "Guests", icon: UsersRound, module: "guests" as const },
  { href: "/logistics", label: "Catering", icon: UtensilsCrossed, module: "logistics" as const },
  { href: "/travel", label: "Stays & Transport", icon: BedDouble, module: "logistics" as const },
  { href: "/schedule", label: "Schedules", icon: ListChecks, module: "logistics" as const },
  { href: "/messages", label: "Messages", icon: Mail, module: "guests" as const },
  { href: "/documents", label: "Documents", icon: FileText },
];

export function WorkspaceShell({ children, weddingName, displayName, role, moduleAccess }: { children: React.ReactNode; weddingName: string; displayName: string; role: MemberRole; moduleAccess: Partial<Record<WeddingModule, AccessLevel>> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) { setOpen(false); menuButtonRef.current?.focus(); return; }
      if (event.key !== "Tab" || !open || !sidebarRef.current) return;
      const items = [...sidebarRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { if (open) sidebarRef.current?.querySelector<HTMLElement>("a[href]")?.focus(); }, [open]);
  const section = mainLinks.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? (pathname === "/settings" ? "Settings" : pathname === "/design-system" ? "Design system" : "Overview");
  // Only the local design-system reference uses sample content; every other page shows wedding data.
  const isDemoPage = pathname === "/design-system";
  const isOwner = role === "owner" || role === "co_owner";
  const visibleLinks = mainLinks.filter((item) => !item.module || isOwner || Boolean(moduleAccess[item.module]));

  return <div className="app-shell">
    <button className={`mobile-backdrop ${open ? "is-open" : ""}`} aria-label="Close navigation" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} />
    <aside ref={sidebarRef} className={`sidebar ${open ? "is-open" : ""}`} aria-label="Workspace navigation" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined}>
      <Link href="/overview" className="brand" aria-label="Wedding Desk home">
        <span className="brand-mark"><Heart size={18} strokeWidth={1.7} aria-hidden="true" /></span><span className="brand-name">Wedding Desk</span>
      </Link>
      <div className="workspace-switcher">
        <span><span className="switch-title">{weddingName}</span><span className="switch-meta">Workspace</span></span>
      </div>
      <p className="nav-label">Workspace</p>
      <nav className="nav-list" aria-label="Main navigation">
        {visibleLinks.map(({ href, label, icon: Icon }) => <Link key={href} className="nav-link" href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></Link>)}
      </nav>
      <div className="sidebar-bottom">
        {isOwner && <Link className="nav-link" href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}><Settings size={17} strokeWidth={1.8} aria-hidden="true" /><span>Settings</span></Link>}
        <span className="nav-link" aria-disabled="true" title="Help is not connected in this preview"><CircleHelp size={17} strokeWidth={1.8} aria-hidden="true" /><span>Help centre · preview</span></span>
        <div className="profile-row"><span className="avatar" aria-hidden="true">{displayName.slice(0, 2).toUpperCase()}</span><span><span className="profile-name">{displayName}</span><span className="profile-role">Authenticated member</span></span></div>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar" inert={open}>
        <div className="topbar-left"><button ref={menuButtonRef} className="icon-button mobile-menu-button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button><span className="topbar-crumb">{weddingName}</span><span className="topbar-divider" aria-hidden="true">/</span><span className="topbar-section">{section}</span></div>
        <div className="topbar-right"><span className="topbar-date">{isDemoPage ? "Demo sample records" : "Wedding data"}</span><span className="avatar" aria-label={displayName}>{displayName.slice(0, 2).toUpperCase()}</span></div>
      </header>
      {isDemoPage && <div className="demo-banner"><span className="demo-pill">SAMPLE DATA</span><span>Sample records, dates and figures are synthetic and are not saved to your wedding.</span></div>}
      <main id="main-content" className="main-content" inert={open}>{children}<p className="footer-note">{isDemoPage ? "Private wedding planning workspace · Demo shell" : "Private wedding planning workspace · Changes are saved to this wedding"}</p></main>
    </div>
  </div>;
}
