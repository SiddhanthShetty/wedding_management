"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Laptop, MessageCircle, Smartphone } from "lucide-react";
import { Card } from "@/components/ui";
import { useRememberedState } from "@/components/use-remembered";
import { inviteLink } from "@/lib/family-invites/rules";
import { SAMPLE_FAMILY, type ChecklistItem } from "@/lib/family-invites/preview";
import type { PreviewFamily } from "@/lib/data/invitation-preview";

const DEVICES = ["phone", "computer"] as const;

/**
 * Guests → Invitation: the invitation a family sees, shown from this app in a frame (the preview
 * page never sends replies), with a family picker, phone or computer width, quick actions and
 * the list of what's still missing.
 */
export function InvitationPreviewPanel({ families, selected, checklist, canSeeFunctions, eventCount }: { families: PreviewFamily[]; selected: string; checklist: ChecklistItem[]; canSeeFunctions: boolean; eventCount: number }) {
  const router = useRouter();
  const [device, setDevice] = useRememberedState("invitation-device", "phone", DEVICES, false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const family = families.find((item) => item.id === selected) ?? null;
  // Relative, so the server and the browser render the same address.
  const link = family?.code && !family.linkOff ? `/i/${family.code}` : null;
  const src = `/invitation-preview?family=${encodeURIComponent(selected)}`;

  const copy = async () => {
    if (!family?.code) return;
    const full = inviteLink(window.location.origin, family.code);
    try { await navigator.clipboard.writeText(full); setCopied(true); setCopyError(""); window.setTimeout(() => setCopied(false), 2000); }
    catch { setCopyError(`Copy didn't work. The link is ${full}`); }
  };

  return <div className="invite-preview">
    <div className="invite-preview-bar">
      <div className="field">
        <label className="field-label" htmlFor="preview-family">See it as</label>
        <select id="preview-family" className="field-control" value={selected} onChange={(event) => router.replace(`/guests/invitation?family=${encodeURIComponent(event.target.value)}`, { scroll: false })}>
          <option value={SAMPLE_FAMILY}>Sample family (every event)</option>
          {families.map((item) => <option key={item.id} value={item.id}>{item.name}{item.linkOff ? " (link turned off)" : !item.code ? " (no link yet)" : ""}</option>)}
        </select>
      </div>
      <div className="segmented" role="group" aria-label="Preview size">
        <button type="button" aria-pressed={device === "phone"} className={device === "phone" ? "is-active" : undefined} onClick={() => setDevice("phone")}><Smartphone size={15} aria-hidden="true" /> Phone</button>
        <button type="button" aria-pressed={device === "computer"} className={device === "computer" ? "is-active" : undefined} onClick={() => setDevice("computer")}><Laptop size={15} aria-hidden="true" /> Computer</button>
      </div>
    </div>

    {family && <div className="invite-preview-actions">
      {link ? <>
        <button type="button" className="button button-secondary" onClick={copy}>{copied ? <><Check size={15} aria-hidden="true" /> Copied</> : <><Copy size={15} aria-hidden="true" /> Copy their link</>}</button>
        <a className="button button-secondary" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> Open as {family.name}</a>
      </> : <p className="field-help">{family.linkOff ? "Their link is turned off." : "They don't have a link yet."} You can still preview what they&apos;ll see.</p>}
      <Link className="button button-secondary" href="/guests/simple#families"><MessageCircle size={15} aria-hidden="true" /> Invite from the families list</Link>
      {copyError && <p className="field-error" role="alert">{copyError}</p>}
    </div>}
    {family && link && <p className="field-help">&ldquo;Open as&rdquo; opens their real link: a reply sent there is saved as theirs.</p>}

    <div className="invite-preview-layout">
      <div className={`invite-frame invite-frame-${device}`}>
        {/* Same-site frame only: the preview page allows this app, and nothing else, to show it. */}
        <iframe key={src} src={src} title={`Invitation preview for ${family?.name ?? "the sample family"}`} loading="lazy" referrerPolicy="no-referrer" />
      </div>
      <Card title="Still to fill in" subtitle={checklist.length ? "Families don't see these notes. Each one is left out of the invitation until it's filled in." : undefined} className="invite-checklist">
        {!canSeeFunctions && <p className="field-help">Events need Plan access to show here; families still see them on their link.</p>}
        {canSeeFunctions && family && eventCount === 0 && <p className="field-error">{family.name} isn&apos;t invited to any events yet, so their invitation has none. Choose them under More → Events and guests.</p>}
        {checklist.length ? <ul>{checklist.map((item) => <li key={item.text}>{item.href ? <Link href={item.href}>{item.text}</Link> : item.text}</li>)}</ul>
          : <p className="field-success">Everything is filled in.</p>}
        <p className="field-help">Wording, family lines, notes and music are in <code>src/config/invitation.ts</code>; events come from Plan → Functions.</p>
      </Card>
    </div>
  </div>;
}
