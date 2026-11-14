"use client";

import { useEffect, useState } from "react";
import { countdownParts } from "@/lib/invite/datetime";
import { Divider } from "./art";

export function Countdown({ targetMs, dateLabel }: { targetMs: number | null; dateLabel: string | null }) {
  // The clock only exists in the browser; render dashes until then so server and client agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (targetMs === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  const parts = targetMs !== null && now !== null ? countdownParts(targetMs, now) : null;
  const cells = [
    ["Days", parts?.days],
    ["Hours", parts?.hours],
    ["Minutes", parts?.minutes],
    ["Seconds", parts?.seconds],
  ] as const;

  return (
    <section id="countdown" aria-labelledby="countdown-title" className="border-y border-gold/50 bg-parchment px-5 py-16 text-center text-maroon sm:py-20">
      {targetMs === null ? (
        <>
          <h2 id="countdown-title" className="font-display text-[clamp(1.9rem,6vw,2.9rem)] leading-tight font-medium italic">
            The celebrations are coming soon
          </h2>
          <Divider className="mt-5" color="#B9853A" />
          <p className="mx-auto mt-5 max-w-md text-maroon/85">We will share the date here as soon as it is set.</p>
        </>
      ) : parts?.done ? (
        <>
          <h2 id="countdown-title" className="font-display text-[clamp(1.9rem,6vw,2.9rem)] leading-tight font-medium italic">
            The celebrations have begun
          </h2>
          <Divider className="mt-5" color="#B9853A" />
        </>
      ) : (
        <>
          <h2 id="countdown-title" className="font-display text-[clamp(1.9rem,6vw,2.9rem)] leading-tight font-medium">
            Until the Muhuratham
          </h2>
          <Divider className="mt-5" color="#B9853A" />
          <div role="timer" aria-label="Time until the wedding" className="mx-auto mt-8 grid max-w-xl grid-cols-4 gap-2 sm:gap-4">
            {cells.map(([label, value]) => (
              <div key={label} className="border border-gold bg-ivory px-1 py-4 sm:py-6">
                <div className="font-display text-[clamp(1.9rem,9vw,3.4rem)] leading-none font-medium tabular-nums">{value === undefined ? "–" : String(value).padStart(2, "0")}</div>
                <div className="mt-2 font-label text-[0.8rem] text-gold-deep sm:text-[0.95rem]">{label}</div>
              </div>
            ))}
          </div>
          {dateLabel ? <p className="mt-6 font-label text-gold-deep">{dateLabel}</p> : null}
        </>
      )}
    </section>
  );
}
