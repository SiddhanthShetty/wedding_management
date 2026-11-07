"use client";
import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { PortalPreview } from "@/components/guest-portal";
import type { GuestPortalData } from "@/lib/guest-portal/server";

/** Opens a family preview link: the token is read from after # and removed from the address bar first. */
export function FamilyPreview() {
  const started = useRef(false);
  const [state, setState] = useState<{ status: "loading" } | { status: "failed" } | { status: "ready"; data: GuestPortalData }>({ status: "loading" });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", "/guest/preview");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setState({ status: "failed" }); return; }
    void fetch("/api/guest-portal/preview", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        const body = response.ok ? await response.json() as { ok: boolean; data?: GuestPortalData } : null;
        setState(body?.ok && body.data ? { status: "ready", data: body.data } : { status: "failed" });
      })
      .catch(() => setState({ status: "failed" }));
  }, []);
  if (state.status === "ready") return <PortalPreview data={state.data} />;
  return <main className="guest-portal-main"><div className="guest-portal-state" role="status"><span className="guest-portal-heart"><Heart size={18} /></span>
    <h1>Invitation preview</h1>
    <p>{state.status === "loading" ? "Opening the preview…" : "This preview link has expired or is not valid. Ask for a new one."}</p>
  </div></main>;
}
