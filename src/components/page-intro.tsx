"use client";
import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { INTROS_SEEN_KEY, PAGE_INTROS } from "@/lib/page-intros";

function readSeen(): string[] {
  try { const value = JSON.parse(window.localStorage.getItem(INTROS_SEEN_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; } catch { return []; }
}

/**
 * A one-line "what this page is for", shown until dismissed on this device.
 * It only appears after the page has loaded, so server and browser render the same HTML.
 */
export function PageIntro({ pathname }: { pathname: string }) {
  const text = PAGE_INTROS[pathname];
  const [seen, setSeen] = useState<string[] | null>(null);
  useEffect(() => { setSeen(readSeen()); }, []);
  if (!text || seen === null || seen.includes(pathname)) return null;
  const dismiss = () => {
    const next = [...seen, pathname];
    setSeen(next);
    try { window.localStorage.setItem(INTROS_SEEN_KEY, JSON.stringify(next)); } catch { /* a convenience only */ }
  };
  return <div className="page-intro no-print" role="note">
    <Info size={16} aria-hidden="true" />
    <p>{text}</p>
    <button type="button" className="button button-quiet page-intro-close" onClick={dismiss} aria-label="Got it, hide this note"><span>Got it</span><X size={14} aria-hidden="true" /></button>
  </div>;
}
