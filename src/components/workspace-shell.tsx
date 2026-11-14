"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FileText, Heart, LogOut, Menu, Plus, Search, Settings, Sparkles, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { LOOK_COOKIE, LOOK_EVENT, softStyleVars, type Look } from "@/lib/soft-look";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";
import type { WorkspaceBranding } from "@/lib/data/branding";
import { activeAreaTab, AREAS, areaForPath, currentSectionLabel, isActiveLink, visibleNavGroups } from "@/lib/navigation";
import { addItemsFor, type AddItem } from "@/lib/add-menu";
import { PageIntro } from "@/components/page-intro";
import { ROLE_NAMES } from "@/lib/roles";

const COLLAPSED_KEY = "wedding-desk:nav-collapsed";
function readCollapsed(): string[] {
  try { const value = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; } catch { return []; }
}

const ROLE_LABELS: Record<MemberRole, string> = ROLE_NAMES;
const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]!.toLocaleUpperCase()).join("") || "?";

/** The avatar in the top bar: who is signed in, Settings (owners) and Sign out (everyone). */
function AccountMenu({ displayName, roleLabel, weddingName, isOwner, pathname, look, onLook }: { displayName: string; roleLabel: string; weddingName: string; isOwner: boolean; pathname: string; look: Look; onLook: (look: Look) => void }) {
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
        {isOwner && <li><Link href="/settings" className="account-menu-item" aria-current={pathname === "/settings" ? "page" : undefined}><Settings size={16} aria-hidden="true" /><span>Settings<small>Wedding details, people and appearance</small></span></Link></li>}
        <li><Link href="/documents" className="account-menu-item" aria-current={pathname === "/documents" ? "page" : undefined}><FileText size={16} aria-hidden="true" /><span>All files<small>Contracts, quotes and photos</small></span></Link></li>
        <li><label className="account-menu-item account-menu-switch"><Sparkles size={16} aria-hidden="true" /><span>Soft look<small>Softer cards and buttons on this device</small></span>
          <input type="checkbox" role="switch" checked={look === "soft"} onChange={(event) => onLook(event.target.checked ? "soft" : "classic")} /></label></li>
        <li><form action={signOutAction}><button type="submit" className="account-menu-item"><LogOut size={16} aria-hidden="true" /><span>Sign out</span></button></form></li>
      </ul>
    </div>}
  </div>;
}

/** "+ Add": one place to start anything, opening the right form on its page. */
function AddMenu({ items, pathname }: { items: AddItem[]; pathname: string }) {
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
    wrapRef.current?.querySelector<HTMLElement>(".account-menu a")?.focus();
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!items.length) return null;
  return <div className="account add-menu" ref={wrapRef}>
    <button ref={buttonRef} type="button" className="button button-primary add-menu-button" aria-expanded={open} aria-controls="add-menu" onClick={() => setOpen((value) => !value)}><Plus size={16} aria-hidden="true" /><span>Add</span></button>
    {open && <div id="add-menu" className="account-menu">
      <p className="add-menu-title">Add a…</p>
      <ul>{items.map((item) => <li key={item.href}><Link href={item.href} className="account-menu-item"><Plus size={14} aria-hidden="true" /><span>{item.label}<small>{item.hint}</small></span></Link></li>)}</ul>
    </div>}
  </div>;
}

export function WorkspaceShell({ children, weddingName, displayName, role, moduleAccess, branding = null, look: initialLook = "classic" }: { children: React.ReactNode; weddingName: string; displayName: string; role: MemberRole; moduleAccess: Partial<Record<WeddingModule, AccessLevel>>; branding?: WorkspaceBranding | null; look?: Look }) {
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

  const [look, setLook] = useState<Look>(initialLook);
  const changeLook = (next: Look) => {
    setLook(next);
    // A display preference only; kept for a year on this device.
    document.cookie = `${LOOK_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
  };
  useEffect(() => {
    const onLook = (event: Event) => { const next = (event as CustomEvent<Look>).detail; if (next === "soft" || next === "classic") changeLook(next); };
    window.addEventListener(LOOK_EVENT, onLook);
    return () => window.removeEventListener(LOOK_EVENT, onLook);
  });
  const brandStyle = { ...(branding ? { ["--brand-accent" as string]: branding.accent, ["--brand-accent-text" as string]: branding.accentText, ["--brand-bg" as string]: branding.background } : {}), ...softStyleVars(branding?.accent) } as React.CSSProperties;
  // Phone tab bar: the main destinations this member can open, plus "More" for the full menu.
  const tabFor = (href: string) => groups.flatMap((group) => group.links).find((link) => link.href === href);
  const phoneTabs = ["/overview", "/tasks", "/guests", "/venues-vendors"].map(tabFor).filter((link): link is NonNullable<typeof link> => Boolean(link));
  return <div className="app-shell" data-look={look} style={brandStyle}>
    <button className={`mobile-backdrop ${open ? "is-open" : ""}`} aria-label="Close navigation" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} />
    <aside ref={sidebarRef} className={`sidebar ${open ? "is-open" : ""}`} aria-label="Menu" role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined}>
      <Link href="/overview" className="brand" aria-label="Wedding Desk home">
        <span className={`brand-mark ${branding?.monogram ? "has-monogram" : ""}`}>{branding?.monogram ? <span aria-hidden="true">{branding.monogram}</span> : <Heart size={18} strokeWidth={1.7} aria-hidden="true" />}</span><span className="brand-name">{branding?.coupleNames || "Wedding Desk"}</span>
      </Link>
      <div className="workspace-switcher">
        <span><span className="switch-title">{weddingName}</span><span className="switch-meta">Your wedding</span></span>
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
        <div className="topbar-right">{isDemoPage && <span className="topbar-date">Demo sample records</span>}
          <form action="/search" role="search" className="topbar-search"><label className="sr-only" htmlFor="topbar-q">Search guests, vendors, tasks and files</label><Search size={15} aria-hidden="true" /><input id="topbar-q" type="search" name="q" placeholder="Search" maxLength={60} /></form>
          <Link href="/search" className="icon-button topbar-search-link" aria-label="Search"><Search size={18} aria-hidden="true" /></Link>
          <AddMenu items={addItemsFor(role, moduleAccess)} pathname={pathname} />
          <AccountMenu displayName={displayName} roleLabel={ROLE_LABELS[role] ?? "Member"} weddingName={weddingName} isOwner={isOwner} pathname={pathname} look={look} onLook={changeLook} /></div>
      </header>
      {isDemoPage && <div className="demo-banner"><span className="demo-pill">SAMPLE DATA</span><span>Made-up names, dates and amounts to show how this page works. Nothing here is saved to your wedding.</span></div>}
      <nav className="phone-tabs" aria-label="Quick navigation" inert={open}>
        {phoneTabs.map((link) => { const Icon = link.icon; return <Link key={link.href} href={link.href} className="phone-tab" aria-current={isActiveLink(pathname, link) ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{link.label}</span></Link>; })}
        <button type="button" className="phone-tab" onClick={() => setOpen(true)} aria-expanded={open}><Menu size={20} aria-hidden="true" /><span>More</span></button>
      </nav>
      <main id="main-content" className="main-content" inert={open}>{area && <nav className="area-tabs" aria-label={{ guests: "Guests sections", plan: "Plan sections", money: "Money sections", week: "Wedding week sections" }[area]}>
        {AREAS[area].filter(() => groups.some((group) => group.links.some((link) => link.area === area))).map((tab) => <Link key={tab.href} href={tab.href} className="area-tab" aria-current={activeAreaTab(pathname, AREAS[area]) === tab.href ? "page" : undefined}>{tab.label}</Link>)}
      </nav>}<PageIntro pathname={pathname} />{children}{isDemoPage && <p className="footer-note">Demo shell</p>}</main>
    </div>
  </div>;
}
