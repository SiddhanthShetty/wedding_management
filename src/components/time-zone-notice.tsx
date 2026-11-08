"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe2 } from "lucide-react";
import { timeZoneOptions } from "@/lib/locale";

const label = (zone: string) => timeZoneOptions(zone).find((option) => option.id === zone)?.label ?? zone;

/**
 * Shown when this device is in a different time zone from the wedding, which is usually a setup
 * mistake (for example a wedding in India set to Ireland). Dismissed per wedding time zone.
 */
export function TimeZoneNotice({ weddingZone, currency, canChange }: { weddingZone: string; currency?: string; canChange: boolean }) {
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  const key = `wedding-desk:tz-notice:${weddingZone}`;
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key)) return;
      setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch { /* no notice */ }
  }, [key]);
  // Rupees with a time zone outside India usually means the wedding was set to the planner's own
  // time zone by mistake (this catches it even when the device is in that same time zone).
  const rupeesAbroad = currency === "INR" && !weddingZone.startsWith("Asia/Kolkata") && !weddingZone.startsWith("Asia/Calcutta");
  if (!deviceZone || (deviceZone === weddingZone && !rupeesAbroad)) return null;
  const dismiss = () => { try { window.localStorage.setItem(key, "1"); } catch { /* fine */ } setDeviceZone(null); };
  return <div className="tz-notice" role="note">
    <Globe2 size={18} aria-hidden="true" />
    <p>{deviceZone === weddingZone
      ? <>Your budget is in rupees, but the wedding is set to <strong>{label(weddingZone)}</strong> time. If the wedding is in India, function times and countdowns will be off. </>
      : <>Your wedding uses <strong>{label(weddingZone)}</strong> time, but this device is on <strong>{label(deviceZone)}</strong> time. Function times and countdowns follow the wedding&apos;s time zone. </>}
      {canChange ? "Change it in Settings if the wedding is somewhere else." : "Ask the couple to check it in Settings if this looks wrong."}</p>
    <div className="tz-notice-actions">
      {canChange && <Link className="button button-primary" href="/settings">Check in Settings</Link>}
      <button type="button" className="button button-quiet" onClick={dismiss}>It&apos;s correct</button>
    </div>
  </div>;
}
