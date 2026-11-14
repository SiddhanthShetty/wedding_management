"use client";

import { useEffect, useRef, useState } from "react";
import { Seal } from "./Monogram";
import { useMusic } from "./MusicProvider";

/**
 * Runs before the page paints (see COVER_SCRIPT): decides whether to show the
 * cover, so returning visitors never see it flash. Without JavaScript the cover
 * stays hidden and the page works as normal.
 */
export const COVER_SCRIPT = `(function(){try{var d=document.documentElement;if(location.hash||sessionStorage.getItem("ss-opened"))d.setAttribute("data-opened","");else d.setAttribute("data-cover","")}catch(e){}})();`;

type Phase = "shut" | "opening" | "open";

/** The page behind the cover, kept out of reach until the doors open. */
const BEHIND = ".invite-site > header, .invite-site > main, .invite-site > footer";

export function Cover({ bride, groom, family }: { bride: string; groom: string; family: string | null }) {
  const [phase, setPhase] = useState<Phase>("shut");
  const music = useMusic();
  const first = useRef<HTMLButtonElement>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const showing = document.documentElement.hasAttribute("data-cover");
    if (!showing) {
      setPhase("open");
      return;
    }
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Keep keyboard and screen-reader focus on the cover until it's opened.
    const behind = document.querySelectorAll<HTMLElement>(BEHIND);
    behind.forEach((el) => (el.inert = true));
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") open(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      behind.forEach((el) => (el.inert = false));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(withMusic: boolean) {
    if (phase !== "shut") return;
    if (withMusic && !music.playing) music.toggle(); // inside the tap, so browsers allow the sound
    try {
      window.sessionStorage.setItem("ss-opened", "1");
    } catch {
      /* ignore */
    }
    document.querySelectorAll<HTMLElement>(BEHIND).forEach((el) => (el.inert = false));
    const done = () => {
      document.documentElement.removeAttribute("data-cover");
      document.documentElement.setAttribute("data-opened", "");
      setPhase("open");
    };
    if (reduceMotion.current) return done();
    setPhase("opening");
    window.setTimeout(done, 1300);
  }

  if (phase === "open") return null;
  return (
    <div id="cover" role="dialog" aria-modal="true" aria-labelledby="cover-title" className={`cover ${phase === "opening" ? "cover-opening" : ""}`}>
      <div className="cover-door cover-door-left silk-door" aria-hidden="true" />
      <div className="cover-door cover-door-right silk-door" aria-hidden="true" />
      {/* A plaque fixed across the two doors, so the seam doesn't run through the text. */}
      <div className="cover-content relative z-10 mx-5 mt-14 w-full max-w-sm border-2 border-gold-bright bg-maroon-deep px-6 pt-20 pb-8 text-center text-ivory shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:max-w-md sm:px-10">
        <div className="pointer-events-none absolute inset-1.5 border border-gold/60" aria-hidden="true" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper p-1.5 shadow-[0_0_0_2px_#E2A93A,0_10px_30px_rgba(0,0,0,0.4)]">
          <Seal className="size-28 sm:size-32" size={256} />
        </div>
        {family ? <p className="font-display text-[1.5rem] italic">Dear {family},</p> : null}
        <p className={`${family ? "mt-2" : ""} font-label text-[0.98rem] tracking-[0.16em] text-champagne`}>You are invited to the wedding of</p>
        <h2 id="cover-title" className="mt-3 font-display text-[clamp(2.6rem,12vw,3.6rem)] leading-[1.05] font-medium italic">
          {bride}
          <span className="block py-1 text-[0.55em] text-gold-bright not-italic">&amp;</span>
          {groom}
        </h2>
        <div className="relative mt-8 flex flex-col gap-3">
          <button ref={first} type="button" onClick={() => open(true)} className="inv-btn inv-btn-gold">
            Open with music
          </button>
          <button type="button" onClick={() => open(false)} className="inv-btn inv-btn-line border-champagne/70 text-ivory">
            Open quietly
          </button>
        </div>
      </div>
    </div>
  );
}

/** Jasmine, marigold and rose petals drifting down once the doors open. */
export function PetalShower() {
  const [petals, setPetals] = useState<{ left: number; delay: number; dur: number; sway: number; size: number; kind: number; spin: number }[] | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Starts when the cover is opened (data-cover is removed), not on later visits.
    if (!html.hasAttribute("data-cover")) return;
    const obs = new MutationObserver(() => {
      if (html.hasAttribute("data-cover")) return;
      obs.disconnect();
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      setPetals(Array.from({ length: 34 }, () => ({ left: rnd() * 100, delay: rnd() * 2.4, dur: 5.5 + rnd() * 4, sway: 20 + rnd() * 50, size: 12 + rnd() * 14, kind: Math.floor(rnd() * 3), spin: 180 + rnd() * 360 })));
      window.setTimeout(() => setPetals(null), 12000);
    });
    obs.observe(html, { attributes: true, attributeFilter: ["data-cover"] });
    return () => obs.disconnect();
  }, []);

  if (!petals) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
      {petals.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ["--sway" as string]: `${p.sway}px`, ["--spin" as string]: `${p.spin}deg` }}
        >
          <svg viewBox="0 0 20 20" width={p.size} height={p.size}>
            {p.kind === 0 ? (
              <g fill="#FFFDF6" stroke="#E9D9B8" strokeWidth={0.6}>
                {[0, 72, 144, 216, 288].map((a) => (
                  <ellipse key={a} cx={10} cy={5} rx={2.6} ry={4.6} transform={`rotate(${a} 10 10)`} />
                ))}
                <circle cx={10} cy={10} r={1.6} fill="#E2A93A" stroke="none" />
              </g>
            ) : p.kind === 1 ? (
              <path d="M10 2C15 5 16 12 10 18C4 12 5 5 10 2Z" fill="#E08A1E" />
            ) : (
              <path d="M10 2C16 4 17 13 10 18C3 13 4 4 10 2Z" fill="#8E1B1F" opacity={0.92} />
            )}
          </svg>
        </span>
      ))}
    </div>
  );
}
