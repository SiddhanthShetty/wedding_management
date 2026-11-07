"use client";
import { useActionState, useEffect, useState } from "react";
import { Heart, Radio, Send } from "lucide-react";
import { submitBlessingAction, type BlessingState } from "@/app/actions/portal";
import type { PortalStrings } from "@/lib/guest-portal/i18n";
import type { PortalBlessing } from "@/lib/guest-portal/server";
import { countdownParts, isLiveWindow, type CountdownTarget, type InvitationSite } from "@/lib/invitations/site";

const OPENED_KEY = "wedding-desk:portal-opened";

/** A one-time "open your invitation" moment per browser session. Skipped for reduced motion. */
export function OpeningOverlay({ t, couple, enabled }: { t: PortalStrings; couple: string; enabled: boolean }) {
  const [state, setState] = useState<"hidden" | "closed" | "opening">("hidden");
  useEffect(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try { if (window.sessionStorage.getItem(OPENED_KEY)) return; } catch { /* show it */ }
    setState("closed");
  }, [enabled]);
  if (state === "hidden") return null;
  const open = () => {
    setState("opening");
    try { window.sessionStorage.setItem(OPENED_KEY, "1"); } catch { /* fine */ }
    window.setTimeout(() => setState("hidden"), 900);
  };
  return <div className={`portal-envelope ${state === "opening" ? "is-opening" : ""}`} role="dialog" aria-modal="true" aria-label={t.openInvitation}>
    <div className="portal-envelope-flap" aria-hidden="true" />
    <div className="portal-envelope-body">
      <span className="portal-envelope-seal" aria-hidden="true"><Heart size={22} /></span>
      <p className="portal-envelope-names">{couple}</p>
      <button type="button" className="portal-envelope-open" onClick={open} autoFocus>{t.openInvitation}</button>
    </div>
  </div>;
}

export function SectionNav({ t, sections }: { t: PortalStrings; sections: Array<{ id: string; label: string }> }) {
  return <nav className="portal-sections" aria-label={t.navInvitation}>
    {sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}
  </nav>;
}

/** Counts down to the next function; on the day shows "happening now" and the livestream link. */
export function CountdownBanner({ t, target, liveTarget, site }: { t: PortalStrings; target: CountdownTarget | null; liveTarget: CountdownTarget | null; site: InvitationSite }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer); }, []);
  if (!now) return null; // render after mount so server and browser clocks never disagree
  const live = liveTarget && isLiveWindow(liveTarget.startsAt, now);
  if (live) return <div className="portal-countdown is-live" role="status">
    <span><Radio size={16} aria-hidden="true" /> {t.liveNow}: <strong>{liveTarget!.name}</strong></span>
    {site.livestream_url && <a className="portal-live-button" href={site.livestream_url} target="_blank" rel="noopener noreferrer">{t.watchLive}</a>}
  </div>;
  if (!site.countdown || !target) return null;
  const parts = countdownParts(target.startsAt, now);
  if (!parts) return null;
  return <div className="portal-countdown" aria-label={t.countdownTitle(target.name)}>
    <p className="portal-countdown-title">{t.countdownTitle(target.name)}</p>
    <div className="portal-countdown-parts" aria-hidden="true">
      <span><strong>{parts.days}</strong>{t.days(parts.days).replace(String(parts.days), "").trim()}</span>
      <span><strong>{parts.hours}</strong>{t.hours(parts.hours).replace(String(parts.hours), "").trim()}</span>
      <span><strong>{parts.minutes}</strong>{t.minutes(parts.minutes).replace(String(parts.minutes), "").trim()}</span>
    </div>
    <p className="sr-only">{t.days(parts.days)}, {t.hours(parts.hours)}, {t.minutes(parts.minutes)}</p>
  </div>;
}

export function StorySection({ t, site }: { t: PortalStrings; site: InvitationSite }) {
  if (!site.story.length) return null;
  return <section id="story" className="guest-portal-person portal-story" aria-labelledby="story-title">
    <h2 id="story-title">{t.ourStory}</h2>
    <ol className="portal-story-list">{site.story.map((moment, index) => <li key={index}>
      {moment.when && <p className="itinerary-date">{moment.when}</p>}
      <h3>{moment.title}</h3>
      {moment.text && <p>{moment.text}</p>}
    </li>)}</ol>
  </section>;
}

export function FaqSection({ t, site }: { t: PortalStrings; site: InvitationSite }) {
  if (!site.faqs.length) return null;
  return <section id="faq" className="guest-portal-person" aria-labelledby="faq-title">
    <h2 id="faq-title">{t.faqTitle}</h2>
    {site.faqs.map((faq, index) => <details key={index} className="portal-faq"><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
  </section>;
}

export function Palette({ t, colors }: { t: PortalStrings; colors: string[] | undefined }) {
  if (!colors?.length) return null;
  return <p className="portal-palette"><span className="sr-only">{t.palette}: {colors.join(", ")}</span>{colors.map((color) => <span key={color} className="portal-swatch" style={{ background: color }} aria-hidden="true" />)}</p>;
}

export function BlessingsSection({ t, site, blessings, pending }: { t: PortalStrings; site: InvitationSite; blessings: PortalBlessing[]; pending: number }) {
  const [state, action, busy] = useActionState<BlessingState, FormData>(submitBlessingAction, {});
  const [key, setKey] = useState("");
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  useEffect(() => { if (state.status === "saved" && state.savedKey === key) setKey(crypto.randomUUID()); }, [state.status, state.savedKey, key]);
  if (!site.blessings_enabled) return null;
  const message = state.status === "saved" || state.status === "duplicate" ? t.blessingThanks : state.status === "limit" ? t.blessingLimit : state.status === "invalid" ? t.invalid : state.status === "unavailable" ? t.unavailableShort : null;
  return <section id="blessings" className="guest-portal-person portal-blessings" aria-labelledby="blessings-title">
    <h2 id="blessings-title">{t.blessingsTitle}</h2>
    <p className="guest-portal-meta">{t.blessingsIntro}</p>
    <form action={action} className="guest-portal-form" key={key}>
      <input type="hidden" name="submissionKey" value={key} />
      <label className="sr-only" htmlFor="blessing-message">{t.blessingPlaceholder}</label>
      <textarea id="blessing-message" name="message" className="guest-portal-input" rows={3} maxLength={500} required placeholder={t.blessingPlaceholder} />
      <button type="submit" className="button button-primary" disabled={busy || !key}><Send size={15} aria-hidden="true" /> {busy ? t.sendingBlessing : t.sendBlessing}</button>
      {message && <p className={state.status === "saved" || state.status === "duplicate" ? "guest-portal-success" : "guest-portal-error"} role="status">{message}</p>}
      {pending > 0 && state.status !== "saved" && <p className="guest-portal-meta">{t.blessingPending(pending)}</p>}
    </form>
    {!blessings.length ? <p className="guest-portal-meta">{t.noBlessingsYet}</p> :
      <ul className="portal-blessing-wall">{blessings.map((blessing, index) => <li key={index}><p>“{blessing.message}”</p><span>— {blessing.name}</span></li>)}</ul>}
  </section>;
}

/** A short shower of jasmine and marigold petals after a guest says yes. Purely decorative; skipped for reduced motion. */
export function PetalBurst() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShow(false); return; }
    const timer = window.setTimeout(() => setShow(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);
  if (!show) return null;
  return <div className="petal-burst" aria-hidden="true">
    {Array.from({ length: 22 }, (_, i) => <span key={i} className={i % 3 === 0 ? "is-marigold" : ""} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.09}s`, ["--drift" as string]: `${((i * 53) % 80) - 40}px`, ["--spin" as string]: `${(i * 67) % 360}deg` }} />)}
  </div>;
}
