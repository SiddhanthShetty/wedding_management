"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy, Download, MessageCircle, Trash2, Users } from "lucide-react";
import { addFamiliesAction, deleteFamilyAction, familyCodeAction, recordFamilyReplyAction, recordFamilySendAction, setFamilyRemovedAction, updateFamilyAction, type AddFamiliesState } from "@/app/actions/family-invites";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button, Card, DataTable, EmptyState } from "@/components/ui";
import type { InviteDesk } from "@/lib/data/family-invites";
import { deleteText, DIETARY_OPTIONS, inviteLink, inviteMessage, reminderMessage, replyLabel, repliesCsv, whatsappLink, type FamilyRow } from "@/lib/family-invites/rules";
import { MAX_FAMILIES_PER_PASTE } from "@/lib/planning/family-paste";
import { formatDate } from "@/lib/format";

const EXAMPLE = "Rao family, +91 98765 43210, 4\nPai family, , 2\nAsha Aunty & Uncle";
type Status = { message?: string; error?: string };

export function GuestDesk({ desk }: { desk: InviteDesk }) {
  // A deleted family's row disappears, so its confirmation is shown above the list instead.
  const [notice, setNotice] = useState("");
  const download = () => {
    const blob = new Blob([`﻿${repliesCsv(desk.families, desk.functions)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "guest-replies.csv"; anchor.click();
    URL.revokeObjectURL(url);
  };
  return <div className="section-stack guest-desk">
    <div className="guest-summary-grid" role="group" aria-label="Replies so far">
      <Tile label="Families invited" value={desk.totals.invited} />
      <Tile label="Replied" value={desk.totals.replied} />
      <Tile label="Not yet replied" value={desk.totals.waiting} />
      <Tile label="Guests coming" value={desk.totals.coming} />
    </div>
    {desk.canEdit ? <AddFamilies desk={desk} /> : <p className="field-help" role="note">You can see the list. To add families or send invitations, ask the couple to let you change guests.</p>}
    <Card title="Families" subtitle="Each family has one link that never changes. Families who haven't replied are at the top."
      action={desk.families.length ? <Button type="button" variant="secondary" onClick={download}><Download size={15} aria-hidden="true" /> Download CSV</Button> : undefined}>
      {notice && <p className="auth-success" role="status">{notice}</p>}
      {!desk.families.length ? <EmptyState icon={<Users size={20} aria-hidden="true" />} title="No families yet" description={desk.canEdit ? "Paste your families above, one per line." : "Families appear here once the couple adds them."} />
        : <DataTable label="Families and their replies" className="stack-on-phone guest-desk-table" headers={["Family", "Phone", "Most guests", "Reply", "Sent", ""]}>
          {desk.families.map((row) => <FamilyLine key={row.id} desk={desk} row={row} onDeleted={setNotice} />)}
        </DataTable>}
    </Card>
    <Card title="Guests per event" subtitle="People coming, from each family's reply. Families who haven't replied are counted as families.">
      {!desk.headcounts.length ? <p className="field-help">Add your events on <Link href="/functions">Plan → Functions</Link> to see counts.</p>
        : <DataTable label="Guests per event" headers={["Event", "Coming", "Not coming", "Not yet replied", "Families invited"]}>
          {desk.headcounts.map((row) => <tr key={row.id}><td className="table-primary">{row.name}</td><td>{row.people} {row.people === 1 ? "person" : "people"}</td><td>{row.notComing} {row.notComing === 1 ? "family" : "families"}</td><td>{row.waiting} {row.waiting === 1 ? "family" : "families"}</td><td>{row.families}</td></tr>)}
        </DataTable>}
    </Card>
  </div>;
}

function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card stat-card"><p className="stat-label">{label}</p><p className="stat-value">{value}</p></div>;
}

/** The paste box. The text stays after a problem (React would otherwise reset the form) and clears once added. */
function AddFamilies({ desk }: { desk: InviteDesk }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<string[]>(() => desk.functions.map((fn) => fn.id));
  const [side, setSide] = useState("unknown");
  const [state, action, pending] = useActionState(async (previous: AddFamiliesState, form: FormData) => {
    const result = await addFamiliesAction(previous, form);
    if (result.message) setText("");
    return result;
  }, {});
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  return <Card title="Add families" subtitle="Each family gets its own link. It greets them by name, and their reply shows up against their name below.">
    {!desk.functions.length ? <p className="field-help">Add your events first on <Link href="/functions">Plan → Functions</Link>, then come back to invite families to them.</p> : <form action={action} className="section-stack desk-add-form">
      <input type="hidden" name="weddingId" value={desk.weddingId} />
      <div className="field">
        <label className="field-label" htmlFor="desk-families">Families</label>
        <textarea id="desk-families" name="families" className="field-control" rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder={EXAMPLE} aria-describedby="desk-families-help" aria-invalid={Boolean(state.problems?.length)} spellCheck={false} />
        <span className="field-help" id="desk-families-help">One family per line: the name they&apos;ll be greeted by, then optionally a <strong>phone</strong> and the <strong>most guests</strong> they may bring, separated by commas. Leave commas out of names. Up to {MAX_FAMILIES_PER_PASTE} at a time. Numbers like 98765 43210 get +91 added.{lines ? ` ${lines} line${lines === 1 ? "" : "s"}.` : ""}</span>
      </div>
      <fieldset className="starter-list family-invite-list"><legend className="field-label">Invite them to</legend>
        {desk.functions.map((fn) => <label key={fn.id} className="checkbox-row"><input type="checkbox" name="inviteTo" value={fn.id} checked={chosen.includes(fn.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, fn.id] : current.filter((value) => value !== fn.id))} /><span>{fn.name}{fn.date ? ` · ${formatDate(fn.date, desk.timezone)}` : ""}</span></label>)}
      </fieldset>
      <div className="field desk-side"><label className="field-label" htmlFor="desk-side">Whose side</label>
        <select id="desk-side" name="familySide" className="field-control" value={side} onChange={(event) => setSide(event.target.value)}>
          {(["couple_one", "couple_two", "shared", "unknown"] as const).map((value) => <option key={value} value={value}>{desk.familySideLabels[value]}</option>)}
        </select></div>
      {state.problems?.length ? <div className="auth-alert" role="alert"><p><strong>Nothing was added.</strong> Fix {state.problems.length === 1 ? "this" : `these ${state.problems.length} problems`} and try again:</p><ul>{state.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div> : null}
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      {state.message && <p className="auth-success" role="status">{state.message}</p>}
      <div className="form-actions"><Button type="submit" disabled={pending || !lines || !chosen.length}>{pending ? "Adding…" : "Add families"}</Button></div>
    </form>}
  </Card>;
}

const day = (value: string | null, timezone: string) => (value ? formatDate(value, timezone) : null);


function FamilyLine({ desk, row, onDeleted }: { desk: InviteDesk; row: FamilyRow; onDeleted: (message: string) => void }) {
  const invited = day(row.invitedAt, desk.timezone);
  const reminded = day(row.remindedAt, desk.timezone);
  return <tr>
    <td><span className="table-primary">{row.name}</span>{row.reply?.message ? <span className="table-secondary">“{row.reply.message.slice(0, 120)}{row.reply.message.length > 120 ? "…" : ""}”</span> : null}</td>
    <td>{row.phone ? <><span className="desk-cell-label">Phone: </span>{row.phone}</> : <span className="table-secondary">No phone</span>}</td>
    <td><span className="desk-cell-label">Most guests: </span>{row.maxGuests ?? "Any"}</td>
    <td><span className={`status ${row.status === "accepts" ? "status-confirmed" : row.status === "declines" ? "status-neutral" : "status-pending"}`}>{replyLabel(row)}</span>
      {row.reply?.attending && row.reply.dietary !== "none" ? <span className="table-secondary">{DIETARY_OPTIONS.find((option) => option.value === row.reply!.dietary)?.label}</span> : null}</td>
    <td><span className="desk-cell-label">Sent: </span><span className="table-secondary">{invited ? `Invited ${invited}` : "Not sent yet"}{reminded ? ` · reminded ${reminded}${row.reminders > 1 ? ` (${row.reminders}×)` : ""}` : ""}</span></td>
    <td>{desk.canEdit ? <FamilyActions desk={desk} row={row} onDeleted={onDeleted} /> : null}</td>
  </tr>;
}

function FamilyActions({ desk, row, onDeleted }: { desk: InviteDesk; row: FamilyRow; onDeleted: (message: string) => void }) {
  const [panel, setPanel] = useState<null | "edit" | "reply">(null);
  const [confirm, setConfirm] = useState<null | "replace" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<Status>({});
  const linkFor = (code: string) => inviteLink(window.location.origin, code);
  /** Opens WhatsApp with the message (from the tap itself, so browsers allow it) and records the send. */
  const send = (kind: "invite" | "remind") => {
    if (!row.code) return;
    const link = linkFor(row.code);
    const message = kind === "invite" ? inviteMessage(row.name, link, desk.coupleNames) : reminderMessage(row.name, link, desk.coupleNames);
    window.open(whatsappLink(row.phone, message).url, "_blank", "noopener,noreferrer");
    void recordFamilySendAction({ weddingId: desk.weddingId, householdId: row.id, kind, message, link }).then(setStatus);
  };
  const copy = async () => {
    if (!row.code) return;
    try { await navigator.clipboard.writeText(linkFor(row.code)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setStatus({ error: `Copy didn't work. The link is ${linkFor(row.code)}` }); }
  };
  const makeCode = async (replace: boolean) => {
    setConfirm(null); setBusy(true); setStatus({});
    const result = await familyCodeAction(desk.weddingId, row.id, replace);
    setBusy(false);
    setStatus(result.error ? { error: result.error } : { message: replace ? "New link made. The old link no longer works; send them the new one." : "Link made. You can invite them now." });
  };
  const turnOn = async () => { setBusy(true); setStatus(await setFamilyRemovedAction(desk.weddingId, row.id, false)); setBusy(false); };
  const destroy = async () => {
    setConfirm(null); setBusy(true);
    const result = await deleteFamilyAction(desk.weddingId, row.id);
    setBusy(false);
    if (result.message) onDeleted(`${row.name}: ${result.message}`); else setStatus(result);
  };
  return <div className="desk-actions">
    <div className="doc-actions">
      {row.removed ? <Button type="button" disabled={busy} onClick={turnOn}>{busy ? "Working…" : "Turn their link back on"}</Button> : row.code ? <>
        <Button type="button" disabled={!row.functionIds.length} onClick={() => send("invite")}><MessageCircle size={15} aria-hidden="true" /> Invite<span className="sr-only"> {row.name} on WhatsApp</span></Button>
        {row.status === "waiting" && <Button type="button" variant="secondary" onClick={() => send("remind")}>Remind<span className="sr-only"> {row.name} on WhatsApp</span></Button>}
        <Button type="button" variant="secondary" onClick={copy}>{copied ? <><Check size={15} aria-hidden="true" /> Copied</> : <><Copy size={15} aria-hidden="true" /> Copy link</>}</Button>
      </> : <Button type="button" disabled={busy} onClick={() => makeCode(false)}>{busy ? "Making…" : "Make their link"}</Button>}
      <details className="desk-more"><summary>More</summary>
        <Button type="button" variant="quiet" onClick={() => setPanel(panel === "edit" ? null : "edit")}>Events and guests</Button>
        <Button type="button" variant="quiet" onClick={() => setPanel(panel === "reply" ? null : "reply")}>Record their reply</Button>
        {row.code && <Button type="button" variant="quiet" disabled={busy} onClick={() => setConfirm("replace")}>Make a new link</Button>}
        <Link className="button button-quiet" href={`/guests?q=${encodeURIComponent(row.name)}`}>People in this family</Link>
        <Button type="button" variant="quiet" className="desk-danger" disabled={busy} onClick={() => setConfirm("delete")}><Trash2 size={15} aria-hidden="true" /> Delete family</Button>
      </details>
    </div>
    {!row.functionIds.length && <p className="field-help">Choose their events under More → Events and guests before inviting them.</p>}
    {panel === "edit" && <EditFamily desk={desk} row={row} onDone={(result) => { setStatus(result); if (result.message) setPanel(null); }} />}
    {panel === "reply" && <RecordReply desk={desk} row={row} onDone={(result) => { setStatus(result); if (result.message) setPanel(null); }} />}
    {status.error && <p className="field-error" role="alert">{status.error}</p>}
    {status.message && <p className="field-success" role="status">{status.message}</p>}
    <ConfirmationDialog open={confirm === "replace"} title={`Make a new link for ${row.name}?`} description="The link they have now stops working. Use this only if the old link reached the wrong people." confirmLabel="Make new link" confirmDisabled={busy} onConfirm={() => makeCode(true)} onCancel={() => setConfirm(null)} />
    <ConfirmationDialog open={confirm === "delete"} title={`Delete ${row.name}?`} description={deleteText(row)} confirmLabel={busy ? "Deleting…" : "Delete family"} confirmDisabled={busy} onConfirm={destroy} onCancel={() => setConfirm(null)} />
  </div>;
}

function EditFamily({ desk, row, onDone }: { desk: InviteDesk; row: FamilyRow; onDone: (result: Status) => void }) {
  const [chosen, setChosen] = useState<string[]>(row.functionIds);
  const [max, setMax] = useState(row.maxGuests ? String(row.maxGuests) : "");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); onDone(await updateFamilyAction(desk.weddingId, row.id, max ? Number(max) : null, chosen)); setBusy(false); };
  return <div className="desk-panel">
    <fieldset className="starter-list"><legend className="field-label">Invited to</legend>
      {desk.functions.map((fn) => <label key={fn.id} className="checkbox-row"><input type="checkbox" checked={chosen.includes(fn.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, fn.id] : current.filter((value) => value !== fn.id))} /><span>{fn.name}</span></label>)}
    </fieldset>
    <div className="field"><label className="field-label" htmlFor={`max-${row.id}`}>Most guests</label>
      <select id={`max-${row.id}`} className="field-control" value={max} onChange={(event) => setMax(event.target.value)}>
        <option value="">Any number</option>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select></div>
    <div className="doc-actions"><Button type="button" disabled={busy || !chosen.length} onClick={save}>{busy ? "Saving…" : "Save"}</Button></div>
  </div>;
}

/** For replies that came by phone or in person. */
function RecordReply({ desk, row, onDone }: { desk: InviteDesk; row: FamilyRow; onDone: (result: Status) => void }) {
  const events = desk.functions.filter((fn) => row.functionIds.includes(fn.id));
  const [coming, setComing] = useState(row.reply ? row.reply.attending : true);
  const [count, setCount] = useState(String(row.reply?.attending ? row.reply.guest_count : 1));
  const [chosen, setChosen] = useState<string[]>(row.reply?.attending ? row.reply.function_ids : events.map((fn) => fn.id));
  const [dietary, setDietary] = useState(row.reply?.dietary ?? "none");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    onDone(await recordFamilyReplyAction({ weddingId: desk.weddingId, householdId: row.id, attending: coming, guestCount: coming ? Number(count) : 0, functionIds: coming ? chosen : [], dietary: coming ? dietary : "none", message: row.reply?.message ?? "" }));
    setBusy(false);
  };
  if (!events.length) return <div className="desk-panel"><p className="field-help">Choose their events first, under Events and guests.</p></div>;
  return <div className="desk-panel">
    <fieldset className="starter-list"><legend className="field-label">Are they coming?</legend>
      <label className="checkbox-row"><input type="radio" name={`coming-${row.id}`} checked={coming} onChange={() => setComing(true)} /><span>Yes</span></label>
      <label className="checkbox-row"><input type="radio" name={`coming-${row.id}`} checked={!coming} onChange={() => setComing(false)} /><span>No</span></label>
    </fieldset>
    {coming && <>
      <div className="field"><label className="field-label" htmlFor={`count-${row.id}`}>How many</label>
        <select id={`count-${row.id}`} className="field-control" value={count} onChange={(event) => setCount(event.target.value)}>
          {Array.from({ length: row.maxGuests ?? 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select></div>
      <fieldset className="starter-list"><legend className="field-label">Which events</legend>
        {events.map((fn) => <label key={fn.id} className="checkbox-row"><input type="checkbox" checked={chosen.includes(fn.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, fn.id] : current.filter((value) => value !== fn.id))} /><span>{fn.name}</span></label>)}
      </fieldset>
      <div className="field"><label className="field-label" htmlFor={`food-${row.id}`}>Food</label>
        <select id={`food-${row.id}`} className="field-control" value={dietary} onChange={(event) => setDietary(event.target.value)}>
          {DIETARY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></div>
    </>}
    <div className="doc-actions"><Button type="button" disabled={busy || (coming && !chosen.length)} onClick={save}>{busy ? "Saving…" : "Save reply"}</Button></div>
  </div>;
}
