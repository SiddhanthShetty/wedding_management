"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Track } from "@/config/invitation";

type MusicState = {
  track: Track;
  playing: boolean;
  error: string | null;
  toggle: () => void;
};

const Ctx = createContext<MusicState | null>(null);

export function useMusic(): MusicState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMusic must be used inside <MusicProvider>");
  return v;
}

/**
 * Owns the page's one <audio> element. Nothing loads or plays until the guest
 * presses play: preload is "none" and there is no autoplay. The track loops.
 */
export function MusicProvider({ track, children }: { track: Track; children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (!el.paused) return el.pause();
    setError(null);
    el.volume = 0.7;
    el.play().catch((e: unknown) => {
      if ((e as DOMException)?.name !== "AbortError") setError("The music could not be played on this device.");
    });
  }, []);

  const value = useMemo<MusicState>(() => ({ track, playing, error, toggle }), [track, playing, error, toggle]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio
        ref={audio}
        src={track.src}
        preload="none"
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setError("The music could not be loaded.");
        }}
      />
    </Ctx.Provider>
  );
}
