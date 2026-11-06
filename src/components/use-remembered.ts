"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * A view preference (tab, filter) remembered per browser. A value from the URL always wins and is
 * remembered; otherwise the last choice is restored after load. Storage failures are ignored.
 */
export function useRememberedState<T extends string>(key: string, initial: T, allowed: readonly T[], fromUrl: boolean): [T, (value: T) => void] {
  const storageKey = `wedding-desk:view:${key}`;
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (fromUrl) { try { window.localStorage.setItem(storageKey, initial); } catch { /* preference only */ } return; }
    try { const stored = window.localStorage.getItem(storageKey); if (stored && (allowed as readonly string[]).includes(stored)) setValue(stored as T); } catch { /* preference only */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, fromUrl]);
  const update = useCallback((next: T) => {
    setValue(next);
    try { window.localStorage.setItem(storageKey, next); } catch { /* preference only */ }
  }, [storageKey]);
  return [value, update];
}

/** Renders long lists in pages so big weddings stay fast; resets when the list itself changes length a lot. */
export function useShowMore<T>(items: T[], step = 40) {
  const [limit, setLimit] = useState(step);
  return { visible: items.slice(0, limit), remaining: Math.max(0, items.length - limit), showMore: () => setLimit((current) => current + step) };
}
