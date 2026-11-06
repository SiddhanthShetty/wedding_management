"use client";
import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * WAI-ARIA tabs: only the selected tab is in the Tab order; Left/Right arrows, Home and End move
 * between tabs and select them. Panels must use id `${idPrefix}-panel-${id}`.
 */
export function TabList<T extends string>({ tabs, selected, onSelect, label, idPrefix }: {
  tabs: Array<{ id: T; label: string; icon: LucideIcon }>; selected: T; onSelect: (id: T) => void; label: string; idPrefix: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(tabs[next]!.id);
    refs.current[next]?.focus();
  };
  return <div className="tab-list" role="tablist" aria-label={label}>
    {tabs.map(({ id, label: text, icon: Icon }, index) => <button key={id} ref={(node) => { refs.current[index] = node; }} type="button" role="tab"
      id={`${idPrefix}-tab-${id}`} aria-selected={selected === id} aria-controls={`${idPrefix}-panel-${id}`} tabIndex={selected === id ? 0 : -1}
      className="tab" onClick={() => onSelect(id)} onKeyDown={(event) => onKeyDown(event, index)}><Icon size={15} aria-hidden="true" />{text}</button>)}
  </div>;
}
