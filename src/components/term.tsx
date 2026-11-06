"use client";
import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/** A term with a small "?" button that shows a plain explanation. Works with keyboard, touch and screen readers. */
export function Term({ term, children }: { term: GlossaryKey; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close); document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", close); };
  }, [open]);
  return <span className="term" ref={ref}>
    {children}
    <button type="button" className="term-button" aria-expanded={open} aria-controls={id} aria-label={`What does this mean?`} onClick={() => setOpen(!open)}>?</button>
    <span id={id} role="note" className="term-popover" hidden={!open}>{GLOSSARY[term]}</span>
  </span>;
}
