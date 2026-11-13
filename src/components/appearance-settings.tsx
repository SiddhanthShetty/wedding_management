"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LOOK_COOKIE, LOOK_EVENT, type Look } from "@/lib/soft-look";

/** The Soft look switch, the same one as in the account menu. It applies straight away on this device. */
export function AppearanceSettings() {
  const [look, setLook] = useState<Look | null>(null);
  useEffect(() => {
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${LOOK_COOKIE}=`));
    setLook(match?.split("=")[1] === "soft" ? "soft" : "classic");
  }, []);
  const change = (next: Look) => {
    setLook(next);
    window.dispatchEvent(new CustomEvent<Look>(LOOK_EVENT, { detail: next }));
  };
  return <div className="section-stack">
    <label className="checkbox-row appearance-switch">
      <input type="checkbox" role="switch" checked={look === "soft"} disabled={look === null} onChange={(event) => change(event.target.checked ? "soft" : "classic")} />
      <span><strong>Soft look</strong><span className="row-meta">Softer cards and buttons. Only on this device; your partner chooses their own.</span></span>
    </label>
    <p className="field-help">The colours come from your invitation theme. To change them, pick another theme in <Link className="text-link" href="/invitations">Guests → Invitations</Link>.</p>
  </div>;
}
