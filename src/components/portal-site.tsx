"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { AtSign, ChevronLeft, ChevronRight, Hash, Heart, Music, Pause, Phone, Radio, Send, X } from "lucide-react";
import type { CelebrationEffect, OpeningStyle } from "@/lib/invitations/site";
import type { PortalMedia } from "@/lib/invitations/media";
import { submitBlessingAction, type BlessingState } from "@/app/actions/portal";
import type { PortalStrings } from "@/lib/guest-portal/i18n";
import type { PortalBlessing } from "@/lib/guest-portal/server";
import { countdownParts, isLiveWindow, type CountdownTarget, type InvitationSite } from "@/lib/invitations/site";

const OPENED_KEY = "wedding-desk:portal-opened";

/** Asks the music button (if any) to start; called from the guest's own tap, so browsers allow sound. */
export const playPortalMusic = () => window.dispatchEvent(new Event("portal:play-music"));

/** A one-time "open your invitation" moment per browser session. Skipped for reduced motion. */
export function OpeningOverlay({ t, couple, enabled, site, monogram, always = false, onOpened }: { t: PortalStrings; couple: string; enabled: boolean; site?: InvitationSite; monogram?: string; always?: boolean; onOpened?: () => void }) {
  const [state, setState] = useState<"hidden" | "closed" | "opening">("hidden");
  useEffect(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Previews (`always`) show it every time so the couple can replay it.
    if (!always) try { if (window.sessionStorage.getItem(OPENED_KEY)) return; } catch { /* show it */ }
    setState("closed");
  }, [enabled, always]);
  if (state === "hidden") return null;
  const style: OpeningStyle = site?.opening_style ?? "envelope";
  const open = () => {
    setState("opening");
    playPortalMusic();
    if (!always) try { window.sessionStorage.setItem(OPENED_KEY, "1"); } catch { /* fine */ }
    window.setTimeout(() => { setState("hidden"); onOpened?.(); }, style === "envelope" ? 900 : 1200);
  };
  const seal = <span className="portal-envelope-seal" aria-hidden="true">{monogram ? <span className="portal-envelope-monogram">{monogram}</span> : <Heart size={22} />}</span>;
  const heading = <>
    <p className="portal-envelope-title">{site?.reveal.title || t.revealTitle}</p>
    <p className="portal-envelope-names">{couple}</p>
  </>;
  const button = <button type="button" className="portal-envelope-open" onClick={open} autoFocus={!always}>{site?.reveal.hint || t.openInvitation}</button>;
  const words = <>{heading}{button}</>;
  return <div className={`portal-envelope style-${style} ${state === "opening" ? "is-opening" : ""}`} role="dialog" aria-modal="true" aria-label={t.openInvitation}>
    {style === "envelope" && <><div className="portal-envelope-flap" aria-hidden="true" /><div className="portal-envelope-body">{seal}{words}</div></>}
    {style === "letter" && <><div className="portal-letter-card">{seal}{heading}</div><div className="portal-letter-sleeve">{button}</div></>}
    {style === "doors" && <><div className="portal-door is-left" aria-hidden="true" /><div className="portal-door is-right" aria-hidden="true" /><div className="portal-envelope-body portal-doors-body">{seal}{words}</div></>}
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
    <h2 id="story-title">{site.titles.story || t.ourStory}</h2>
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
    <h2 id="faq-title">{site.titles.faq || t.faqTitle}</h2>
    {site.faqs.map((faq, index) => <details key={index} className="portal-faq"><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
  </section>;
}

export function Palette({ t, colors }: { t: PortalStrings; colors: string[] | undefined }) {
  if (!colors?.length) return null;
  return <p className="portal-palette"><span className="sr-only">{t.palette}: {colors.join(", ")}</span>{colors.map((color) => <span key={color} className="portal-swatch" style={{ background: color }} aria-hidden="true" />)}</p>;
}

export function BlessingsSection({ t, site, blessings, pending, preview = false }: { t: PortalStrings; site: InvitationSite; blessings: PortalBlessing[]; pending: number; preview?: boolean }) {
  const [state, action, busy] = useActionState<BlessingState, FormData>(submitBlessingAction, {});
  const [key, setKey] = useState("");
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  useEffect(() => { if (state.status === "saved" && state.savedKey === key) setKey(crypto.randomUUID()); }, [state.status, state.savedKey, key]);
  if (!site.blessings_enabled) return null;
  const message = state.status === "saved" || state.status === "duplicate" ? t.blessingThanks : state.status === "limit" ? t.blessingLimit : state.status === "invalid" ? t.invalid : state.status === "unavailable" ? t.unavailableShort : null;
  return <section id="blessings" className="guest-portal-person portal-blessings" aria-labelledby="blessings-title">
    <h2 id="blessings-title">{site.titles.blessings || t.blessingsTitle}</h2>
    <p className="guest-portal-meta">{t.blessingsIntro}</p>
    {preview ? <p className="portal-preview-note">{t.previewRsvpOff}</p> : <form action={action} className="guest-portal-form" key={key}>
      <input type="hidden" name="submissionKey" value={key} />
      <label className="sr-only" htmlFor="blessing-message">{t.blessingPlaceholder}</label>
      <textarea id="blessing-message" name="message" className="guest-portal-input" rows={3} maxLength={500} required placeholder={t.blessingPlaceholder} />
      <button type="submit" className="button button-primary" disabled={busy || !key}><Send size={15} aria-hidden="true" /> {busy ? t.sendingBlessing : t.sendBlessing}</button>
      {message && <p className={state.status === "saved" || state.status === "duplicate" ? "guest-portal-success" : "guest-portal-error"} role="status">{message}</p>}
      {pending > 0 && state.status !== "saved" && <p className="guest-portal-meta">{t.blessingPending(pending)}</p>}
    </form>}
    {!blessings.length ? <p className="guest-portal-meta">{t.noBlessingsYet}</p> :
      <ul className="portal-blessing-wall">{blessings.map((blessing, index) => <li key={index}><p>“{blessing.message}”</p><span>— {blessing.name}</span></li>)}</ul>}
  </section>;
}

/** A short shower of petals or confetti. Purely decorative; skipped for reduced motion. */
export function CelebrationBurst({ kind = "petals" }: { kind?: CelebrationEffect }) {
  const [show, setShow] = useState(kind !== "none");
  useEffect(() => {
    if (kind === "none" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShow(false); return; }
    const timer = window.setTimeout(() => setShow(false), 2800);
    return () => window.clearTimeout(timer);
  }, [kind]);
  if (!show) return null;
  const confetti = ["#e2b45a", "#b3261e", "#2f7d5b", "#e98b1d", "#7d1747"];
  return <div className={`petal-burst is-${kind}`} aria-hidden="true">
    {Array.from({ length: kind === "confetti" ? 34 : 22 }, (_, i) => <span key={i} className={kind === "petals" && i % 3 === 0 ? "is-marigold" : ""} style={{
      left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.09}s`, ["--drift" as string]: `${((i * 53) % 80) - 40}px`, ["--spin" as string]: `${(i * 67) % 360}deg`,
      ...(kind === "confetti" ? { background: confetti[i % confetti.length] } : {}),
    }} />)}
  </div>;
}
/** @deprecated kept for older imports; use CelebrationBurst. */
export const PetalBurst = () => <CelebrationBurst kind="petals" />;

/** Plays the couple's music only after a tap (browsers block sound before that). */
export function MusicButton({ t, src }: { t: PortalStrings; src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const play = () => { const el = audio.current; if (!el) return; el.volume = 0.6; void el.play().then(() => setPlaying(true), () => setPlaying(false)); };
    window.addEventListener("portal:play-music", play);
    return () => window.removeEventListener("portal:play-music", play);
  }, []);
  const toggle = () => { const el = audio.current; if (!el) return; if (el.paused) { el.volume = 0.6; void el.play().then(() => setPlaying(true), () => setPlaying(false)); } else { el.pause(); setPlaying(false); } };
  return <>
    <audio ref={audio} src={src} loop preload="none" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
    <button type="button" className={`portal-music ${playing ? "is-playing" : ""}`} onClick={toggle} aria-pressed={playing}>
      {playing ? <Pause size={16} aria-hidden="true" /> : <Music size={16} aria-hidden="true" />}<span>{playing ? t.pauseMusic : t.playMusic}</span>
    </button>
  </>;
}

/** The couple's photos in a grid; tapping one opens it full screen, with arrows and Escape. */
export function GallerySection({ t, media }: { t: PortalStrings; media?: PortalMedia }) {
  const [open, setOpen] = useState<number | null>(null);
  const photos = media?.gallery ?? [];
  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setOpen((index) => index === null ? null : (index + 1) % photos.length);
      if (event.key === "ArrowLeft") setOpen((index) => index === null ? null : (index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);
  if (!media || !photos.length) return null;
  const current = open === null ? null : photos[open];
  return <section id="gallery" className="guest-portal-person portal-gallery" aria-labelledby="gallery-title">
    <h2 id="gallery-title">{t.galleryTitle}</h2>
    <ul className="portal-gallery-grid">{photos.map((photo, index) => <li key={photo.id}>
      <button type="button" onClick={() => setOpen(index)} aria-label={photo.caption || t.photoOf(index + 1, photos.length)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked files */}
        <img src={`${media.base}${photo.id}`} alt="" loading="lazy" decoding="async" />
      </button>
      {photo.caption && <p>{photo.caption}</p>}
    </li>)}</ul>
    {current && <div className="portal-lightbox" role="dialog" aria-modal="true" aria-label={current.caption || t.photoOf(open! + 1, photos.length)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(null); }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked files */}
      <img src={`${media.base}${current.id}`} alt={current.caption} />
      {current.caption && <p>{current.caption}</p>}
      <button type="button" className="portal-lightbox-close" onClick={() => setOpen(null)} aria-label={t.close} autoFocus><X size={20} /></button>
      {photos.length > 1 && <>
        <button type="button" className="portal-lightbox-prev" onClick={() => setOpen((open! - 1 + photos.length) % photos.length)} aria-label={t.previous}><ChevronLeft size={22} /></button>
        <button type="button" className="portal-lightbox-next" onClick={() => setOpen((open! + 1) % photos.length)} aria-label={t.next}><ChevronRight size={22} /></button>
      </>}
    </div>}
  </section>;
}

/** Kalyana Mantapa template: a mango-leaf thoranam with marigolds across the top of the page. */
export function MantapaThoranam() {
  const leaves = Array.from({ length: 13 }, (_, i) => i);
  return <svg className="mantapa-thoranam" viewBox="0 0 390 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M0 6 Q195 34 390 6" fill="none" stroke="#7a5a1e" strokeWidth="2" />
    {leaves.map((i) => {
      const x = 15 + i * 30; const y = 6 + 28 * (1 - Math.pow((x - 195) / 195, 2)) * 0.95;
      return <g key={i} transform={`translate(${x} ${y})`}>
        <path d="M0 0 C7 10 6 26 0 36 C-6 26 -7 10 0 0 Z" fill={i % 2 ? "#3f7a3a" : "#5b9a45"} />
        <path d="M0 2 L0 33" stroke="#2c5a28" strokeWidth=".8" />
        {i % 2 === 0 && <circle cx="0" cy="-1" r="5" fill="#f2a516" stroke="#d9800b" strokeWidth="1" />}
      </g>;
    })}
  </svg>;
}

/** Kacheri template: a veena drawn as a single line, under the programme heading. */
export function KacheriVeena() {
  return <svg className="kacheri-veena" viewBox="0 0 320 60" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <ellipse cx="46" cy="34" rx="30" ry="20" />
      <path d="M76 30 L262 26 M76 38 L262 34" />
      <circle cx="232" cy="40" r="12" />
      <path d="M262 24 C282 16 290 6 300 10 C296 20 282 34 262 36" />
      {[100, 125, 150, 175, 200].map((x) => <path key={x} d={`M${x} 27.5 L${x} 36.5`} />)}
      <path d="M40 30 L300 14" strokeWidth=".7" opacity=".7" /><path d="M40 36 L300 18" strokeWidth=".7" opacity=".7" />
    </g>
  </svg>;
}

/** A link to an invitation website made elsewhere. Replies still happen on this page. */
export function ExternalInvitationLink({ t, site }: { t: PortalStrings; site: InvitationSite }) {
  if (!site.external_link.url) return null;
  return <div className="portal-external">
    <a className="portal-live-button" href={site.external_link.url} target="_blank" rel="noopener noreferrer">{site.external_link.label || t.fullInvitation} ↗</a>
    <p className="guest-portal-meta">{t.replyHere}</p>
  </div>;
}

/** The blessing line shown above the invitation. */
export function BlessingHeader({ site }: { site: InvitationSite }) {
  return site.blessing_header ? <p className="portal-blessing-header">{site.blessing_header}</p> : null;
}

/** Each partner's name with their parents' line, under the card. Hidden until a parents' line is written. */
export function FamilyLines({ names, site }: { names: string[]; site: InvitationSite }) {
  const rows = [[names[0], site.parents.one], [names[1], site.parents.two]].filter(([name, line]) => name && line);
  if (!rows.length) return null;
  return <div className="portal-family-lines">{rows.map(([name, line], index) => <div key={index}>
    <p className="portal-family-name">{name}</p><p className="portal-family-parents">{line}</p>
  </div>)}</div>;
}

export function InfoSection({ t, site }: { t: PortalStrings; site: InvitationSite }) {
  if (!site.info_cards.length) return null;
  return <section id="info" className="guest-portal-person" aria-labelledby="info-title">
    <h2 id="info-title">{site.titles.info || t.infoTitle}</h2>
    <div className="portal-info-cards">{site.info_cards.map((card, index) => <article key={index} className="portal-info-card">
      <h3>{card.title}</h3>
      {card.text && <p>{card.text}</p>}
      {card.phone && <a className="itinerary-action" href={`tel:${card.phone.replace(/[^+0-9]/g, "")}`}><Phone size={15} aria-hidden="true" /> {t.call} {card.phone}</a>}
    </article>)}</div>
  </section>;
}

/** Family names that close the invitation, and the couple's hashtag and Instagram handles. */
export function ClosingSection({ t, site }: { t: PortalStrings; site: InvitationSite }) {
  const hasFamily = site.closing.names.length > 0;
  const hasSocial = Boolean(site.hashtag) || site.instagram.length > 0;
  if (!hasFamily && !hasSocial) return null;
  return <section className="guest-portal-person portal-closing" aria-label={site.closing.title || t.closingTitle}>
    {hasFamily && <><p className="guest-portal-eyebrow">{site.closing.title || t.closingTitle}</p>
      <ul className="portal-closing-names">{site.closing.names.map((name, index) => <li key={index}>{name}</li>)}</ul></>}
    {hasSocial && <div className="portal-social">
      <p className="guest-portal-meta">{t.shareMoments}</p>
      {site.hashtag && <p className="portal-hashtag"><Hash size={16} aria-hidden="true" />{site.hashtag.replace(/^#/, "")}</p>}
      {site.instagram.map((handle) => <a key={handle} className="itinerary-action" href={`https://www.instagram.com/${encodeURIComponent(handle)}/`} target="_blank" rel="noopener noreferrer"><AtSign size={15} aria-hidden="true" />{handle}</a>)}
    </div>}
  </section>;
}
