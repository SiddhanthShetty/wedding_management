"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Card } from "@/components/ui";
import { discardInvitationDraftAction, publishInvitationAction, restoreInvitationVersionAction, saveInvitationDraftAction, type InvitationEditState } from "@/app/actions/invitation-settings";
import { EVENT_IDS } from "@/config/invitation";
import { EVENT_LABELS, TRACKS, type InvitationSettings } from "@/lib/invitation/settings";
import type { EditorState } from "@/lib/data/invitation-settings";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

function statusText(state: EditorState) {
  switch (state.status) {
    case "original": return "Families see the original wording. Edit below and save a draft; nothing changes for families until you publish.";
    case "unpublished": return `Draft saved ${when(state.draftUpdatedAt)}, not published yet. Families still see the original wording.`;
    case "changes": return `Draft has changes that aren't published. Families see version ${state.publishedVersion} (published ${when(state.publishedAt)}).`;
    case "published": return `Families see version ${state.publishedVersion}, published ${when(state.publishedAt)}. The draft is the same.`;
  }
}

/**
 * Guests → Invitation → Edit: the invitation's wording as a draft, shown in the preview, and
 * Publish to send it to families' links. Owners and co-owners only (the database checks too).
 */
export function InvitationEditor({ weddingId, state }: { weddingId: string; state: EditorState }) {
  const [saveState, save, saving] = useActionState<InvitationEditState, FormData>(saveInvitationDraftAction, {});
  // Unsaved: typed into since the last successful save (after which the form starts from the new draft).
  // Both times are this browser's clock.
  const [editedAt, setEditedAt] = useState(0);
  const [submittedAt, setSubmittedAt] = useState(0);
  const dirty = editedAt > (saveState.message && !saving ? submittedAt : 0);
  const errors = saveState.errors ?? {};
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!state.canEdit) {
    return <Card title="Wording" subtitle="Only the couple (owners and co-owners) can change the invitation's wording.">
      <p className="field-help">{statusText(state)}</p>
    </Card>;
  }

  const d = state.draft;
  const field = (name: string, label: string, value: string | null, options: { hint?: string; type?: string; rows?: number; maxLength?: number; required?: boolean } = {}) => {
    const id = `inv-${name.replace(/\./g, "-")}`;
    const error = errors[name];
    const described = [options.hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
    const common = { id, name, defaultValue: value ?? "", className: "field-control", maxLength: options.maxLength, required: options.required, "aria-invalid": Boolean(error) || undefined, "aria-describedby": described };
    return <div className="field" key={name}>
      <label className="field-label" htmlFor={id}>{label}{options.required && <span aria-hidden="true"> *</span>}</label>
      {options.rows ? <textarea rows={options.rows} {...common} /> : <input type={options.type ?? "text"} {...common} />}
      {options.hint && <span className="field-help" id={`${id}-hint`}>{options.hint}</span>}
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>;
  };
  const section = (title: string, open: boolean, children: ReactNode, names: string[]) =>
    <details className="inv-edit-section" open={open || names.some((name) => Object.keys(errors).some((key) => key.startsWith(name)))}>
      <summary>{title}</summary><div className="inv-edit-fields">{children}</div>
    </details>;
  const lines = (list: string[] | null) => (list ?? []).join("\n");

  return <Card title="Wording" subtitle="Save a draft to see it in the preview. Families see it only after you publish." className="inv-editor">
    <p className="inv-edit-status" role="status">{statusText(state)}</p>
    {/* Submitted by hand (not form action) so a failed check keeps everything typed. */}
    <form key={state.draftUpdatedAt ?? "original"} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setSubmittedAt(Date.now()); startTransition(() => save(data)); }} onInput={() => setEditedAt(Date.now())} noValidate>
      <input type="hidden" name="weddingId" value={weddingId} />
      <input type="hidden" name="base" value={state.draftUpdatedAt ?? ""} />
      {section("Names and place", true, <>
        {field("brideName", "Bride's name (on the cover)", d.brideName, { required: true, maxLength: 60 })}
        {field("groomName", "Groom's name (on the cover)", d.groomName, { required: true, maxLength: 60 })}
        {field("location", "Place", d.location, { required: true, maxLength: 120, hint: "Shown under the date, e.g. Mangaluru, Karnataka, India." })}
        {field("weddingTime", "Wedding time", d.weddingTime, { type: "time", hint: "The countdown runs to this time on the wedding day. Leave empty to use the first function's start time." })}
      </>, ["brideName", "groomName", "location", "weddingTime"])}
      {section("Family lines", false, <>
        {field("families.brideFullName", "Bride's full name", d.families.brideFullName, { maxLength: 120, hint: "Optional. Used in the family lines instead of the cover name." })}
        {field("families.brideParents", "Bride's parents", d.families.brideParents, { maxLength: 300, hint: "e.g. Shri A and Smt. B. Shown after D/o." })}
        {field("families.brideGrandparents", "Bride's grandparents", lines(d.families.brideGrandparents), { rows: 3, hint: "One pair per line, up to 4. Shown after G/D/o." })}
        {field("families.groomFullName", "Groom's full name", d.families.groomFullName, { maxLength: 120 })}
        {field("families.groomParents", "Groom's parents", d.families.groomParents, { maxLength: 300, hint: "Shown after S/o." })}
        {field("families.groomGrandparents", "Groom's grandparents", lines(d.families.groomGrandparents), { rows: 3, hint: "One pair per line, up to 4. Shown after G/S/o." })}
      </>, ["families"])}
      {section("Event notes", false, <>
        <p className="field-help">Shown under each event when its function in Plan → Functions has no description. Dates, times, venues and map links are edited in Plan → Functions.</p>
        {EVENT_IDS.map((id) => field(`eventDescriptions.${id}`, EVENT_LABELS[id], d.eventDescriptions[id], { rows: 2, maxLength: 400, required: true }))}
      </>, ["eventDescriptions"])}
      {section("Good to know", false, <>
        <p className="field-help">Each one you fill in appears for families; empty ones are left out.</p>
        {field("goodToKnow.weather", "Weather", d.goodToKnow.weather, { rows: 2, maxLength: 400 })}
        {field("goodToKnow.dressCode", "What to wear", d.goodToKnow.dressCode, { rows: 2, maxLength: 400 })}
        {field("goodToKnow.hashtag", "Photo hashtag", d.goodToKnow.hashtag, { maxLength: 61, hint: "e.g. #SweekrutiWedsSiddhanth" })}
        {field("goodToKnow.parking", "Parking", d.goodToKnow.parking, { rows: 2, maxLength: 400 })}
        {field("goodToKnow.driversAndStaff", "Drivers and staff", d.goodToKnow.driversAndStaff, { rows: 2, maxLength: 400 })}
      </>, ["goodToKnow"])}
      {section("Reply and contact", false, <>
        {field("respondBy", "Reply by", d.respondBy, { type: "date", hint: "Families are asked to reply by this date." })}
        {field("contact.name", "Contact name", d.contact.name, { maxLength: 80, hint: "Shown at the bottom for questions. Optional." })}
        {field("contact.phone", "Contact phone", d.contact.phone, { type: "tel", maxLength: 20 })}
        {field("contact.email", "Contact email", d.contact.email, { type: "email", maxLength: 120 })}
      </>, ["respondBy", "contact"])}
      {section("Music", false, <fieldset className="inv-edit-music" aria-describedby={errors.musicId ? "inv-music-error" : undefined}>
        <legend className="sr-only">Music</legend>
        {(Object.entries(TRACKS) as Array<[InvitationSettings["musicId"], (typeof TRACKS)[keyof typeof TRACKS]]>).map(([id, track]) => <label key={id} className="check-row">
          <input type="radio" name="musicId" value={id} defaultChecked={d.musicId === id} /> {track.title}{track.credit ? ` (${track.credit})` : ""}
        </label>)}
        <span className="field-help">Plays only when a family chooses &ldquo;Open with music&rdquo; or presses play.</span>
        {errors.musicId && <span className="field-error" id="inv-music-error">{errors.musicId}</span>}
      </fieldset>, ["musicId"])}
      <div className="inv-edit-footer">
        <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
        {dirty && !saving && <span className="field-help">Unsaved changes</span>}
      </div>
      {saveState.error && <p className="field-error" role="alert">{saveState.error}</p>}
      {!saveState.error && saveState.message && !dirty && <p className="field-success" role="status">{saveState.message}</p>}
    </form>
    <PublishControls weddingId={weddingId} state={state} dirty={dirty} />
  </Card>;
}

function PublishControls({ weddingId, state, dirty }: { weddingId: string; state: EditorState; dirty: boolean }) {
  const [published, publish, publishing] = useActionState<InvitationEditState, FormData>(publishInvitationAction, {});
  const [discarded, discard, discarding] = useActionState<InvitationEditState, FormData>(discardInvitationDraftAction, {});
  const [restored, restore, restoring] = useActionState<InvitationEditState, FormData>(restoreInvitationVersionAction, {});
  const [confirm, setConfirm] = useState<null | "publish" | "discard" | number>(null);
  const run = (action: (data: FormData) => void, fields: Record<string, string>) => {
    const data = new FormData();
    data.set("weddingId", weddingId);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    startTransition(() => action(data));
  };
  const busy = publishing || discarding || restoring;
  const canPublish = (state.status === "unpublished" || state.status === "changes") && !dirty;
  const canDiscard = state.status === "unpublished" || state.status === "changes";
  const latest = [published, discarded, restored].filter((item) => item.at || item.error).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];

  return <div className="inv-publish">
    <div className="inv-edit-footer">
      <button type="button" className="button button-primary" disabled={!canPublish || busy} onClick={() => setConfirm("publish")}>{publishing ? "Publishing…" : "Publish to families"}</button>
      <button type="button" className="button button-secondary" disabled={!canDiscard || busy} onClick={() => setConfirm("discard")}>{discarding ? "Discarding…" : "Discard draft"}</button>
    </div>
    {dirty && <p className="field-help">Save the draft first, then publish.</p>}
    {!dirty && !canPublish && state.status !== "original" && <p className="field-help">Nothing new to publish.</p>}
    {[published, discarded, restored].map((item, index) => item === latest && (item.error ? <p key={index} className="field-error" role="alert">{item.error}</p> : item.message ? <p key={index} className="field-success" role="status">{item.message}</p> : null))}
    {state.history.length > 0 && <details className="inv-edit-section">
      <summary>Published versions ({state.history.length})</summary>
      <ul className="inv-history">{state.history.map((item) => <li key={item.version}>
        <span>Version {item.version} · {when(item.publishedAt)}{item.version === state.publishedVersion ? " · families see this" : ""}</span>
        <button type="button" className="text-button" disabled={busy} onClick={() => setConfirm(item.version)}>Put in draft</button>
      </li>)}</ul>
    </details>}
    <ConfirmationDialog open={confirm === "publish"} title="Publish to families?" description="Every family sees the new wording the next time they open their link. Earlier versions are kept, so you can go back." confirmLabel="Publish"
      onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); run(publish, { base: state.draftUpdatedAt ?? "" }); }} />
    <ConfirmationDialog open={confirm === "discard"} title="Discard the draft?" description={state.status === "unpublished" ? "The draft is deleted and the preview goes back to the original wording. Families aren't affected." : "The draft goes back to what families see now. Families aren't affected."} confirmLabel="Discard draft"
      onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); run(discard, {}); }} />
    <ConfirmationDialog open={typeof confirm === "number"} title={`Put version ${typeof confirm === "number" ? confirm : ""} in the draft?`} description="It replaces the current draft (not what families see). Check the preview, then publish it." confirmLabel="Put in draft"
      onCancel={() => setConfirm(null)} onConfirm={() => { if (typeof confirm === "number") { run(restore, { version: String(confirm) }); setConfirm(null); } }} />
  </div>;
}
