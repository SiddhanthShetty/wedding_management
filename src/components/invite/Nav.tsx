"use client";

import { Menu, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMusic } from "./MusicProvider";

const LINKS = [
  { href: "#story", label: "Our story" },
  { href: "#families", label: "Families" },
  { href: "#events", label: "Events" },
];

export function Nav({ names, logo, showGoodToKnow = false }: { names: string; logo: React.ReactNode; showGoodToKnow?: boolean }) {
  const links = showGoodToKnow ? [...LINKS, { href: "#good-to-know", label: "Good to know" }] : LINKS;
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const music = useMusic();
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`no-print fixed inset-x-0 top-0 z-40 text-maroon transition-[background-color,box-shadow] duration-300 ${solid || open ? "bg-paper/95 shadow-[0_1px_0_0_rgba(185,133,58,0.6)] backdrop-blur" : "bg-transparent"}`}>
      <a href="#story" className="inv-btn inv-btn-gold sr-only top-2 left-2 z-50 focus:not-sr-only focus:absolute">
        Skip to the invitation
      </a>
      <nav aria-label="Sections" className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <a href="#top" className="flex min-h-11 min-w-0 items-center gap-2.5" aria-label={`${names}, back to top`}>
          <span className="size-10 shrink-0">{logo}</span>
          <span className={`hidden truncate font-display text-[1.25rem] italic transition-opacity duration-300 min-[400px]:block ${solid || open ? "opacity-100" : "opacity-0"}`}>{names}</span>
        </a>
        <ul className="ml-auto hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-sm px-3 py-2.5 font-label text-[0.95rem] hover:text-burgundy hover:underline hover:decoration-gold hover:underline-offset-8">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={music.toggle}
          aria-label={music.playing ? "Pause music" : "Play music"}
          title={music.error ?? (music.playing ? "Pause music" : `Play music: ${music.track.title}`)}
          className="ml-auto grid size-11 shrink-0 place-items-center rounded-full border border-gold bg-ivory/70 hover:bg-champagne/60 lg:ml-2"
        >
          {music.playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4 translate-x-px" aria-hidden="true" />}
        </button>
        <a href="#rsvp" className="inv-btn inv-btn-maroon min-h-11 px-4 py-2 text-[0.95rem]">
          RSVP
        </a>
        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid size-11 shrink-0 place-items-center rounded-sm border border-gold bg-ivory/70 lg:hidden"
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </nav>
      {open ? (
          <div id="mobile-menu" className="overflow-hidden border-t border-gold/50 lg:hidden">
            <ul className="mx-auto max-w-6xl px-4 py-3">
              {links.map((l) => (
                <li key={l.href} className="border-b border-gold/30 last:border-0">
                  <a href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center font-label text-[1.05rem]">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
    </header>
  );
}
