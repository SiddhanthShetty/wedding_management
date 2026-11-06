"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, Menu, Settings, X } from "lucide-react";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";
import { AREAS, areaForPath, currentSectionLabel, isActiveLink, visibleNavGroups } from "@/lib/navigation";

const COLLAPSED_KEY = "wedding-desk:nav-collapsed";
function readCollapsed(): string[] {
  try { const value = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; } catch { return []; }
}

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
  const section = currentSectionLabel(pathname);
  const area = areaForPath(pathname);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => { setCollapsed(readCollapsed()); }, []);
  const toggleGroup = (id: string) => setCollapsed((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    try { window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch { /* preference only */ }
    return next;
  });
  // Only the local design-system reference uses sample content; every other page shows wedding data.
  const isDemoPage = pathname === "/design-system";
  const isOwner = role === "owner" || role === "co_owner";
  const groups = visibleNavGroups(role, moduleAccess);

  return <div className="app-shell">
    <button className={`mobile-backdrop ${open ? "is-open" : ""}`} aria-label="Close navigation" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} />
    <aside ref={sidebarRef} className={`sidebar ${open ? "is-open" : ""}`} aria-label="Workspace navigation" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined}>
      <Link href="/overview" className="brand" aria-label="Wedding Desk home">
        <span className="brand-mark"><Heart size={18} strokeWidth={1.7} aria-hidden="true" /></span><span className="brand-name">Wedding Desk</span>
      </Link>
      <div className="workspace-switcher">
        <span><span className="switch-title">{weddingName}</span><span className="switch-meta">Workspace</span></span>
      </div>
      <nav className="nav-groups" aria-label="Main navigation">
        {groups.map((group) => {
          // A group holding the current page always stays open.
          const isOpen = !collapsed.includes(group.id) || group.links.some((link) => isActiveLink(pathname, link));
          const links = <ul className="nav-list">{group.links.map((link) => { const Icon = link.icon; return <li key={link.href}><Link className="nav-link" href={link.href} aria-current={isActiveLink(pathname, link) ? "page" : undefined}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{link.label}</span></Link></li>; })}</ul>;
          if (!group.label) return <div key={group.id} className="nav-group">{links}</div>;
          return <div key={group.id} className="nav-group">
            <button type="button" className="nav-group-toggle" aria-expanded={isOpen} aria-controls={`nav-group-${group.id}`} onClick={() => toggleGroup(group.id)}>
              <span>{group.label}</span><ChevronDown size={14} aria-hidden="true" className={isOpen ? "is-open" : ""} />
            </button>
            <div id={`nav-group-${group.id}`} hidden={!isOpen}>{links}</div>
          </div>;
        })}
      </nav>
      <div className="sidebar-bottom">
        {isOwner && <Link className="nav-link" href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}><Settings size={17} strokeWidth={1.8} aria-hidden="true" /><span>Settings</span></Link>}
        <div className="profile-row"><span className="avatar" aria-hidden="true">{displayName.slice(0, 2).toUpperCase()}</span><span><span className="profile-name">{displayName}</span><span className="profile-role">{role === "owner" ? "Owner" : role === "co_owner" ? "Co-owner" : role === "read_only_collaborator" ? "View only" : "Family helper"}</span></span></div>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar" inert={open}>
        <div className="topbar-left"><button ref={menuButtonRef} className="icon-button mobile-menu-button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button><span className="topbar-crumb">{weddingName}</span><span className="topbar-divider" aria-hidden="true">/</span><span className="topbar-section">{section}</span></div>
        <div className="topbar-right"><span className="topbar-date">{isDemoPage ? "Demo sample records" : "Wedding data"}</span><span className="avatar" aria-label={displayName}>{displayName.slice(0, 2).toUpperCase()}</span></div>
      </header>
      {isDemoPage && <div className="demo-banner"><span className="demo-pill">SAMPLE DATA</span><span>Sample records, dates and figures are synthetic and are not saved to your wedding.</span></div>}
      <main id="main-content" className="main-content" inert={open}>{area && <nav className="area-tabs" aria-label={area === "guests" ? "Guests sections" : "Wedding week sections"}>
        {AREAS[area].filter((tab) => groups.some((group) => group.links.some((link) => link.area === area))).map((tab) => <Link key={tab.href} href={tab.href} className="area-tab" aria-current={pathname === tab.href || pathname.startsWith(`${tab.href}/`) ? "page" : undefined}>{tab.label}</Link>)}
      </nav>}{children}<p className="footer-note">{isDemoPage ? "Private wedding planning workspace · Demo shell" : "Private wedding planning workspace · Changes are saved to this wedding"}</p></main>
    </div>
  </div>;
}
