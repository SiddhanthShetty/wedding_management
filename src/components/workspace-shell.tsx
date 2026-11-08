"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, LogOut, Menu, Settings, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";
import type { WorkspaceBranding } from "@/lib/data/branding";
import { AREAS, areaForPath, currentSectionLabel, isActiveLink, visibleNavGroups } from "@/lib/navigation";

const COLLAPSED_KEY = "wedding-desk:nav-collapsed";
function readCollapsed(): string[] {
  try { const value = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; } catch { return []; }
}

const ROLE_LABELS: Record<MemberRole, string> = { owner: "Owner", co_owner: "Co-owner", scoped_collaborator: "Family helper", read_only_collaborator: "View only" };
const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]!.toLocaleUpperCase()).join("") || "?";

/** The avatar in the top bar: who is signed in, Settings (owners) and Sign out (everyone). */
function AccountMenu({ displayName, roleLabel, weddingName, isOwner, pathname }: { displayName: string; roleLabel: string; weddingName: string; isOwner: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    wrapRef.current?.querySelector<HTMLElement>(".account-menu a, .account-menu button")?.focus();
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div className="account" ref={wrapRef}>
    <button ref={buttonRef} type="button" className="avatar avatar-button" aria-label={`Account: ${displayName}`} aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen((value) => !value)}>{initialsOf(displayName)}</button>
    {open && <div id="account-menu" className="account-menu">
      <div className="account-menu-head">
        <span className="avatar" aria-hidden="true">{initialsOf(displayName)}</span>
        <span className="account-menu-who"><span className="profile-name">{displayName}</span><span className="profile-role">{roleLabel} · {weddingName}</span></span>
      </div>
      <ul>
        {isOwner && <li><Link href="/settings" className="account-menu-item" aria-current={pathname === "/settings" ? "page" : undefined}><Settings size={16} aria-hidden="true" /><span>Settings<small>Wedding details and members</small></span></Link></li>}
        <li><form action={signOutAction}><button type="submit" className="account-menu-item"><LogOut size={16} aria-hidden="true" /><span>Sign out</span></button></form></li>
      </ul>
    </div>}
  </div>;
}

export function WorkspaceShell({ children, weddingName, displayName, role, moduleAccess, branding = null }: { children: React.ReactNode; weddingName: string; displayName: string; role: MemberRole; moduleAccess: Partial<Record<WeddingModule, AccessLevel>>; branding?: WorkspaceBranding | null }) {
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

  const brandStyle = branding ? { ["--brand-accent" as string]: branding.accent, ["--brand-accent-text" as string]: branding.accentText, ["--brand-bg" as string]: branding.background } as React.CSSProperties : undefined;
  // Phone tab bar: the main destinations this member can open, plus "More" for the full menu.
  const tabFor = (href: string) => groups.flatMap((group) => group.links).find((link) => link.href === href);
  const phoneTabs = ["/overview", "/guests", "/schedule"].map(tabFor).filter((link): link is NonNullable<typeof link> => Boolean(link));
  return <div className="app-shell" style={brandStyle}>
    <button className={`mobile-backdrop ${open ? "is-open" : ""}`} aria-label="Close navigation" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} />
    <aside ref={sidebarRef} className={`sidebar ${open ? "is-open" : ""}`} aria-label="Workspace navigation" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined}>
      <Link href="/overview" className="brand" aria-label="Wedding Desk home">
        <span className={`brand-mark ${branding?.monogram ? "has-monogram" : ""}`}>{branding?.monogram ? <span aria-hidden="true">{branding.monogram}</span> : <Heart size={18} strokeWidth={1.7} aria-hidden="true" />}</span><span className="brand-name">{branding?.coupleNames || "Wedding Desk"}</span>
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
        <div className="profile-row"><span className="avatar" aria-hidden="true">{initialsOf(displayName)}</span><span className="profile-text"><span className="profile-name">{displayName}</span><span className="profile-role">{ROLE_LABELS[role] ?? "Member"}</span></span></div>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar" inert={open}>
        <div className="topbar-left"><button ref={menuButtonRef} className="icon-button mobile-menu-button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button><span className="topbar-crumb">{weddingName}</span><span className="topbar-divider" aria-hidden="true">/</span><span className="topbar-section">{section}</span></div>
        <div className="topbar-right">{isDemoPage && <span className="topbar-date">Demo sample records</span>}<AccountMenu displayName={displayName} roleLabel={ROLE_LABELS[role] ?? "Member"} weddingName={weddingName} isOwner={isOwner} pathname={pathname} /></div>
      </header>
      {isDemoPage && <div className="demo-banner"><span className="demo-pill">SAMPLE DATA</span><span>Sample records, dates and figures are synthetic and are not saved to your wedding.</span></div>}
      <nav className="phone-tabs" aria-label="Quick navigation" inert={open}>
        {phoneTabs.map((link) => { const Icon = link.icon; return <Link key={link.href} href={link.href} className="phone-tab" aria-current={isActiveLink(pathname, link) ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{link.label}</span></Link>; })}
        <button type="button" className="phone-tab" onClick={() => setOpen(true)} aria-expanded={open}><Menu size={20} aria-hidden="true" /><span>More</span></button>
      </nav>
      <main id="main-content" className="main-content" inert={open}>{area && <nav className="area-tabs" aria-label={area === "guests" ? "Guests sections" : "Wedding week sections"}>
        {AREAS[area].filter(() => groups.some((group) => group.links.some((link) => link.area === area))).map((tab) => <Link key={tab.href} href={tab.href} className="area-tab" aria-current={pathname === tab.href || pathname.startsWith(`${tab.href}/`) ? "page" : undefined}>{tab.label}</Link>)}
      </nav>}{children}{isDemoPage && <p className="footer-note">Demo shell</p>}</main>
    </div>
  </div>;
}
