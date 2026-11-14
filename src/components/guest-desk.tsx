"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, MessageCircle, Plus, Trash2, Users } from "lucide-react";
import { addFamiliesAction, deleteFamilyAction, familyCodeAction, recordFamilyReplyAction, recordFamilySendAction, setFamilyRemovedAction, updateFamilyAction, type AddFamiliesState } from "@/app/actions/family-invites";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { MealChoice } from "@/components/meal-choice";
import { deleteGuestAction, saveGuestAction, saveHouseholdAction, type GuestActionState } from "@/app/actions/guests";
import { reminderPlan } from "@/lib/planning/reminder-plan";
import { Button, Card, DataTable, EmptyState } from "@/components/ui";
import type { FamilyPerson, InviteDesk } from "@/lib/data/family-invites";
import { deleteText, DIETARY_OPTIONS, fillUpdate, inviteLink, inviteMessage, reminderMessage, updateTemplate, replyLabel, repliesCsv, whatsappLink, type FamilyRow } from "@/lib/family-invites/rules";
import { checkFamilyEntries, emptyEntry, MAX_FAMILIES_AT_ONCE, MAX_FAMILY_NAME, MAX_GUESTS_PER_FAMILY, phoneProblem, tidyPhone, type EntryError, type EntryField, type FamilyEntry } from "@/lib/planning/family-entries";
import { formatDate } from "@/lib/format";

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
    <WhenToSend desk={desk} />
    {desk.canEdit ? <AddFamilies desk={desk} /> : <p className="field-help" role="note">You can see the list. To add families or send invitations, ask the couple to let you change guests.</p>}
    <Card id="families" title="Families" subtitle="Each family has one link that never changes. Families who haven't replied are at the top."
      action={desk.families.length ? <Button type="button" variant="secondary" onClick={download}><Download size={15} aria-hidden="true" /> Download CSV</Button> : undefined}>
      {notice && <p className="auth-success" role="status">{notice}</p>}
      {!desk.families.length ? <EmptyState icon={<Users size={20} aria-hidden="true" />} title="No families yet" description={desk.canEdit ? "Paste your families above, one per line." : "Families appear here once the couple adds them."} />
        : <DataTable label="Families and their replies" className="stack-on-phone guest-desk-table" headers={["Family", "Phone", "Most guests", "Reply", "Sent", ""]}>
          {desk.families.map((row) => <FamilyLine key={row.id} desk={desk} row={row} onDeleted={setNotice} />)}
        </DataTable>}
    </Card>
    {desk.canEdit && <SendUpdate desk={desk} />}
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

/**
 * "Add families": one row per family with its own boxes for the name, phone and most guests. The
 * rows are kept in state, so what was typed stays after a problem (React would otherwise reset the
 * form), and they clear once the families are added. The same checks run here and on the server.
 */
function AddFamilies({ desk }: { desk: InviteDesk }) {
  const [entries, setEntries] = useState<FamilyEntry[]>(() => [emptyEntry()]);
  const [shown, setShown] = useState<EntryError[]>([]);
  const [chosen, setChosen] = useState<string[]>(() => desk.functions.map((fn) => fn.id));
  const [side, setSide] = useState("unknown");
  const [state, action, pending] = useActionState(async (previous: AddFamiliesState, form: FormData) => {
    const result = await addFamiliesAction(previous, form);
    setShown(result.errors ?? []);
    if (result.message) setEntries([emptyEntry()]);
    return result;
  }, {});
  const errorFor = (row: number, field: EntryField) => shown.find((error) => error.row === row && error.field === field)?.message;
  const change = (row: number, field: EntryField, value: string) => {
    setEntries((current) => current.map((entry, index) => (index === row ? { ...entry, [field]: value } : entry)));
    setShown((current) => current.filter((error) => !(error.row === row && error.field === field)));
  };
  const removeRow = (row: number) => {
    setEntries((current) => current.filter((_, index) => index !== row));
    setShown((current) => current.filter((error) => error.row !== row).map((error) => (error.row > row ? { ...error, row: error.row - 1 } : error)));
  };
  /** Checks in the browser first; the form is only sent when every box is fine. */
  const check = (event: React.FormEvent<HTMLFormElement>) => {
    const { errors } = checkFamilyEntries(entries);
    if (!errors.length) return;
    event.preventDefault();
    setShown(errors);
    const first = errors[0]!;
    event.currentTarget.querySelector<HTMLElement>(`#family-${first.field}-${first.row}`)?.focus();
  };
  const filled = entries.some((entry) => entry.name.trim() || entry.phone.trim() || entry.guests.trim());
  return <Card title="Add families" subtitle="Each family gets its own link. It greets them by name, and their reply shows up against their name below.">
    {!desk.functions.length ? <p className="field-help">Add your events first on <Link href="/functions">Plan → Functions</Link>, then come back to invite families to them.</p> : <form action={action} onSubmit={check} noValidate className="section-stack desk-add-form">
      <input type="hidden" name="weddingId" value={desk.weddingId} />
      <ol className="family-entries">{entries.map((entry, row) => {
        const tidy = tidyPhone(entry.phone);
        const box = (field: EntryField, label: string, input: React.ReactNode, hint?: string) => {
          const error = errorFor(row, field);
          return <div className="field"><label className="field-label" htmlFor={`family-${field}-${row}`}>{label}</label>{input}
            {error ? <span className="field-error" id={`family-${field}-${row}-error`} role="alert">{error}</span> : hint ? <span className="field-help">{hint}</span> : null}</div>;
        };
        const describe = (field: EntryField) => errorFor(row, field) ? { "aria-invalid": true as const, "aria-describedby": `family-${field}-${row}-error` } : {};
        return <li key={row} className="family-entry">
          <span className="family-entry-number" aria-hidden="true">{row + 1}</span>
          {box("name", "Family name", <input id={`family-name-${row}`} name="familyName" className="field-control" value={entry.name} onChange={(event) => change(row, "name", event.target.value)} maxLength={MAX_FAMILY_NAME} autoComplete="off" placeholder="Rao family" {...describe("name")} />, "As they'll be greeted: “Dear Rao family”.")}
          {box("phone", "WhatsApp number (optional)", <input id={`family-phone-${row}`} name="familyPhone" className="field-control" type="tel" inputMode="tel" value={entry.phone} onChange={(event) => change(row, "phone", event.target.value)} maxLength={20} autoComplete="off" placeholder="98765 43210" {...describe("phone")} />, entry.phone.trim() && tidy !== entry.phone.trim() && !phoneProblem(tidy) ? `Saved as ${tidy}` : "So Invite opens their chat.")}
          {box("guests", "Most guests (optional)", <input id={`family-guests-${row}`} name="familyGuests" className="field-control" inputMode="numeric" value={entry.guests} onChange={(event) => change(row, "guests", event.target.value.replace(/[^0-9]/g, ""))} maxLength={2} autoComplete="off" placeholder="4" {...describe("guests")} />, `1 to ${MAX_GUESTS_PER_FAMILY}. Leave empty for any number.`)}
          {entries.length > 1 && <Button type="button" variant="quiet" className="family-entry-remove" onClick={() => removeRow(row)} aria-label={`Remove row ${row + 1}`}><Trash2 size={15} aria-hidden="true" /></Button>}
        </li>;
      })}</ol>
      {entries.length < MAX_FAMILIES_AT_ONCE && <div><Button type="button" variant="secondary" onClick={() => setEntries((current) => [...current, emptyEntry()])}><Plus size={15} aria-hidden="true" /> Add another family</Button></div>}
      <fieldset className="starter-list family-invite-list"><legend className="field-label">Invite them to</legend>
        {desk.functions.map((fn) => <label key={fn.id} className="checkbox-row"><input type="checkbox" name="inviteTo" value={fn.id} checked={chosen.includes(fn.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, fn.id] : current.filter((value) => value !== fn.id))} /><span>{fn.name}{fn.date ? ` · ${formatDate(fn.date, desk.timezone)}` : ""}</span></label>)}
        {!chosen.length && <span className="field-error" role="alert">Choose at least one event.</span>}
      </fieldset>
      <div className="field desk-side"><label className="field-label" htmlFor="desk-side">Whose side</label>
        <select id="desk-side" name="familySide" className="field-control" value={side} onChange={(event) => setSide(event.target.value)}>
          {(["couple_one", "couple_two", "shared", "unknown"] as const).map((value) => <option key={value} value={value}>{desk.familySideLabels[value]}</option>)}
        </select></div>
      {shown.length > 0 && <p className="auth-alert" role="alert"><strong>Nothing was added.</strong> Fix the {shown.length === 1 ? "box" : "boxes"} marked in red and try again.</p>}
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      {state.message && !shown.length && <p className="auth-success" role="status">{state.message}</p>}
      <div className="form-actions"><Button type="submit" disabled={pending || !filled || !chosen.length}>{pending ? "Adding…" : entries.length > 1 ? `Add ${entries.length} families` : "Add family"}</Button></div>
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
    <td><span className="desk-cell-label">Sent: </span><span className="table-secondary">{invited ? `Invited ${invited}` : "Not sent yet"}{reminded ? ` · reminded ${reminded}${row.reminders > 1 ? ` (${row.reminders}×)` : ""}` : ""}{row.updateSentAt ? ` · update ${day(row.updateSentAt, desk.timezone)}` : ""}</span></td>
    <td>{desk.canEdit ? <FamilyActions desk={desk} row={row} onDeleted={onDeleted} /> : null}</td>
  </tr>;
}

function FamilyActions({ desk, row, onDeleted }: { desk: InviteDesk; row: FamilyRow; onDeleted: (message: string) => void }) {
  const [panel, setPanel] = useState<null | "edit" | "reply" | "details">(null);
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
      <MoreMenu label={`More for ${row.name}`} items={[
        { label: "Events and guests", onSelect: () => setPanel(panel === "edit" ? null : "edit") },
        { label: "Record their reply", onSelect: () => setPanel(panel === "reply" ? null : "reply") },
        ...(row.code ? [{ label: "Make a new link", onSelect: () => setConfirm("replace"), disabled: busy }] : []),
        { label: "Family details and people", onSelect: () => setPanel(panel === "details" ? null : "details") },
        { label: "Delete family", onSelect: () => setConfirm("delete"), disabled: busy, danger: true },
      ]} />
    </div>
    {!row.functionIds.length && <p className="field-help">Choose their events under More → Events and guests before inviting them.</p>}
    {panel === "edit" && <EditFamily desk={desk} row={row} onDone={(result) => { setStatus(result); if (result.message) setPanel(null); }} />}
    {panel === "details" && <FamilyDetailsPanel desk={desk} row={row} />}
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

/** Suggested dates for invitations, reminders and the last update, counted back from the wedding. */
function WhenToSend({ desk }: { desk: InviteDesk }) {
  const steps = reminderPlan(desk.weddingDate, desk.today);
  const now = steps.find((step) => step.state === "now");
  const show = (date: string) => formatDate(date, "UTC");
  if (!steps.length) return <details className="more-details when-to-send"><summary>When to send</summary><p className="field-help">Set your wedding date in <Link href="/settings">Settings</Link> to see when to send invitations, reminders and updates.</p></details>;
  return <details className="more-details when-to-send"><summary>When to send{now ? `: ${now.title.toLowerCase()} now` : ""}</summary>
    <ol className="plan-steps">{steps.map((step) => <li key={step.key} className={`plan-step is-${step.state}`}>
      <span className="plan-date">{show(step.date)}</span>
      <span className="plan-body"><strong>{step.title}</strong>{step.state === "now" && <span className="status status-pending">Now</span>}<span className="row-meta">{step.detail}</span></span>
      {step.state !== "upcoming" && <a className="button button-secondary" href={step.href}>{step.action}</a>}
    </li>)}</ol>
    <p className="field-help">Suggestions only. Nothing is sent automatically.</p>
  </details>;
}

/**
 * Send an update (directions and timings, a change of time) to the families coming to one event,
 * or everyone invited to it. Write it once; each family's name and link are filled in.
 */
function SendUpdate({ desk }: { desk: InviteDesk }) {
  const [functionId, setFunctionId] = useState(desk.functions[0]?.id ?? "");
  const [audience, setAudience] = useState<"coming" | "invited">("coming");
  const fn = desk.functions.find((row) => row.id === functionId);
  const template = (target = fn) => target ? updateTemplate({ name: target.name, date: target.date, time: target.time, venue: target.venue }, desk.coupleNames) : "";
  const [message, setMessage] = useState(() => template());
  const [sent, setSent] = useState<Record<string, Status>>({});
  const choose = (id: string) => { setFunctionId(id); setMessage(template(desk.functions.find((row) => row.id === id))); setSent({}); };
  const families = desk.families.filter((row) => !row.removed && row.functionIds.includes(functionId) && (audience === "invited" || (row.reply?.attending && row.reply.function_ids.includes(functionId))));
  const problem = !message.trim() ? "Write the message first." : null;
  const send = (row: FamilyRow) => {
    if (!row.code) return;
    const link = inviteLink(window.location.origin, row.code);
    const text = fillUpdate(message, row.name, link);
    window.open(whatsappLink(row.phone, text).url, "_blank", "noopener,noreferrer");
    void recordFamilySendAction({ weddingId: desk.weddingId, householdId: row.id, kind: "update", message: text, link, functionId }).then((result) => setSent((current) => ({ ...current, [row.id]: result })));
  };
  if (!desk.functions.length) return null;
  return <Card id="send-update" title="Send an update" subtitle="For directions, timings or a change, a few days before an event. Write it once; each family's name and their link are filled in.">
    <div className="field-grid">
      <div className="field"><label className="field-label" htmlFor="update-event">Event</label>
        <select id="update-event" className="field-control" value={functionId} onChange={(event) => choose(event.target.value)}>{desk.functions.map((row) => <option key={row.id} value={row.id}>{row.name}{row.date ? ` · ${formatDate(row.date, desk.timezone)}` : ""}</option>)}</select></div>
      <fieldset className="starter-list"><legend className="field-label">Send to</legend>
        <label className="checkbox-row"><input type="radio" name="update-audience" checked={audience === "coming"} onChange={() => setAudience("coming")} /><span>Families coming</span></label>
        <label className="checkbox-row"><input type="radio" name="update-audience" checked={audience === "invited"} onChange={() => setAudience("invited")} /><span>Everyone invited</span></label>
      </fieldset>
    </div>
    <div className="field"><label className="field-label" htmlFor="update-message">Message</label>
      <textarea id="update-message" className="field-control" rows={6} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} aria-describedby="update-message-help" aria-invalid={Boolean(problem)} />
      <span className="field-help" id="update-message-help">{problem ?? "{family} becomes the family's name and {link} their invitation link."}</span></div>
    {!families.length ? <p className="field-help">{audience === "coming" ? "No family has said yes to this event yet." : "No family is invited to this event yet."}</p>
      : <ul className="doc-list update-list">{families.map((row) => {
        const result = sent[row.id];
        return <li key={row.id} className="reference-row"><span className="row-title">{row.name}</span><span className="row-meta">{row.phone || "No number: WhatsApp will ask you to pick the chat"}</span>
          <span className="doc-actions">{row.code ? <Button type="button" variant="secondary" disabled={Boolean(problem)} onClick={() => send(row)}><MessageCircle size={15} aria-hidden="true" /> WhatsApp<span className="sr-only"> {row.name}</span></Button> : <span className="field-help">Make their link first.</span>}
            {result?.message && <span className="field-success" role="status"><Check size={14} aria-hidden="true" /> Sent</span>}{result?.error && <span className="field-error" role="alert">{result.error}</span>}</span></li>;
      })}</ul>}
  </Card>;
}

const MEAL_LABELS = { meal: "Food", choose: "Not told us yet", other: "Something else", otherHint: "What they eat", veg: "Veg", nonveg: "Non-veg", jain: "Jain", vegan: "Vegan" };

/** A family's own details and the people in it, for stays, rides and food. */
function FamilyDetailsPanel({ desk, row }: { desk: InviteDesk; row: FamilyRow }) {
  const details = desk.details[row.id];
  const router = useRouter();
  const [state, action, pending] = useActionState(saveHouseholdAction, {} as GuestActionState);
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone);
  const [adding, setAdding] = useState(false);
  const [checked, setChecked] = useState<{ name?: string; phone?: string }>({});
  useEffect(() => { if (state.message) router.refresh(); }, [state.message, router]);
  if (!details) return null;
  const check = (event: React.FormEvent<HTMLFormElement>) => {
    const tidy = tidyPhone(phone);
    const found = { name: name.trim().length < 2 ? "Enter the family's name." : undefined, phone: phoneProblem(tidy) ?? undefined };
    setChecked(found);
    if (found.name || found.phone) { event.preventDefault(); return; }
    // The tidied number (+91 …) is what gets saved.
    const box = event.currentTarget.elements.namedItem("contactPhone") as HTMLInputElement | null;
    if (box) box.value = tidy;
    setPhone(tidy);
  };
  return <div className="desk-panel family-details">
    <form action={action} onSubmit={check} noValidate className="field-grid">
      <input type="hidden" name="weddingId" value={desk.weddingId} /><input type="hidden" name="householdId" value={row.id} />
      <input type="hidden" name="contactName" value={details.contactName} /><input type="hidden" name="contactEmail" value={details.contactEmail} />
      <div className="field"><label className="field-label" htmlFor={`fd-name-${row.id}`}>Family name</label><input id={`fd-name-${row.id}`} name="name" className="field-control" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(checked.name)} />{checked.name && <span className="field-error" role="alert">{checked.name}</span>}</div>
      <div className="field"><label className="field-label" htmlFor={`fd-phone-${row.id}`}>WhatsApp number</label><input id={`fd-phone-${row.id}`} name="contactPhone" type="tel" inputMode="tel" className="field-control" value={phone} maxLength={20} onChange={(event) => setPhone(event.target.value)} aria-invalid={Boolean(checked.phone)} />{checked.phone && <span className="field-error" role="alert">{checked.phone}</span>}</div>
      <div className="field"><label className="field-label" htmlFor={`fd-side-${row.id}`}>Whose side</label><select id={`fd-side-${row.id}`} name="familySide" className="field-control" defaultValue={details.familySide}>{(["couple_one", "couple_two", "shared", "unknown"] as const).map((value) => <option key={value} value={value}>{desk.familySideLabels[value]}</option>)}</select></div>
      <div className="field"><label className="field-label" htmlFor={`fd-address-${row.id}`}>Address (optional)</label><input id={`fd-address-${row.id}`} name="address" className="field-control" defaultValue={details.address} maxLength={1200} /></div>
      <div className="field field-full"><label className="field-label" htmlFor={`fd-notes-${row.id}`}>Notes (only you see these)</label><input id={`fd-notes-${row.id}`} name="notes" className="field-control" defaultValue={details.notes} maxLength={4000} /></div>
      {state.error && <p className="field-error field-full" role="alert">{state.error}</p>}{state.message && <p className="field-success field-full" role="status">Saved.</p>}
      <div className="doc-actions field-full"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save family details"}</Button></div>
    </form>
    <div className="family-people">
      <p className="field-label">People in this family ({details.people.length})</p>
      <p className="field-help">Add names only when you need them: for rooms and pickups (Stays &amp; travel), or someone&apos;s food or help needs.</p>
      <ul className="doc-list">{details.people.map((person) => <PersonRow key={person.id} desk={desk} person={person} />)}</ul>
      {adding ? <PersonForm desk={desk} householdId={row.id} onDone={() => setAdding(false)} /> : <Button type="button" variant="secondary" onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" /> Add a person</Button>}
    </div>
  </div>;
}

function PersonRow({ desk, person }: { desk: InviteDesk; person: FamilyPerson }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({});
  const remove = async () => {
    setConfirming(false); setBusy(true);
    const result = await deleteGuestAction(desk.weddingId, person.id, person.updated_at);
    setBusy(false);
    if (result.error) setStatus({ error: result.error }); else router.refresh();
  };
  if (editing) return <li><PersonForm desk={desk} householdId={person.household_id} person={person} onDone={() => setEditing(false)} /></li>;
  const needs = [person.meal_preference, person.allergies && `Allergies: ${person.allergies}`, person.assistance_needs && `Help: ${person.assistance_needs}`].filter(Boolean).join(" · ");
  return <li className="reference-row"><span className="row-title">{person.full_name}</span><span className="row-meta">{[person.phone, needs].filter(Boolean).join(" · ") || "No details yet"}</span>
    <span className="doc-actions"><Button type="button" variant="quiet" onClick={() => setEditing(true)}>Edit<span className="sr-only"> {person.full_name}</span></Button>
      <Button type="button" variant="quiet" className="desk-danger" disabled={busy} onClick={() => setConfirming(true)}>Delete<span className="sr-only"> {person.full_name}</span></Button></span>
    {status.error && <span className="field-error" role="alert">{status.error}</span>}
    <ConfirmationDialog open={confirming} title={`Delete ${person.full_name}?`} description="This removes this person and their stay, ride and food details. The family and its reply stay. It can't be undone." confirmLabel="Delete person" confirmDisabled={busy} onConfirm={remove} onCancel={() => setConfirming(false)} />
  </li>;
}

/** Add or edit one person: name, phone, food, allergies and help they need. */
function PersonForm({ desk, householdId, person, onDone }: { desk: InviteDesk; householdId: string; person?: FamilyPerson; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveGuestAction, {} as GuestActionState);
  const [name, setName] = useState(person?.full_name ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [checked, setChecked] = useState<{ name?: string; phone?: string }>({});
  useEffect(() => { if (state.message) { router.refresh(); onDone(); } }, [state.message, router, onDone]);
  const id = person?.id ?? `new-${householdId}`;
  const check = (event: React.FormEvent<HTMLFormElement>) => {
    const tidy = tidyPhone(phone);
    const found = { name: name.trim().length < 2 ? "Enter their name." : undefined, phone: tidy ? phoneProblem(tidy) ?? undefined : undefined };
    setChecked(found);
    if (found.name || found.phone) { event.preventDefault(); return; }
    const box = event.currentTarget.elements.namedItem("phone") as HTMLInputElement | null;
    if (box) box.value = tidy;
    setPhone(tidy);
  };
  return <form action={action} onSubmit={check} noValidate className="field-grid person-form">
    <input type="hidden" name="weddingId" value={desk.weddingId} /><input type="hidden" name="guestId" value={person?.id ?? ""} /><input type="hidden" name="expectedUpdatedAt" value={person?.updated_at ?? ""} />
    <input type="hidden" name="householdId" value={householdId} /><input type="hidden" name="email" value={person?.email ?? ""} /><input type="hidden" name="followUpOwnerUserId" value={person?.follow_up_owner_user_id ?? ""} /><input type="hidden" name="notes" value={person?.notes ?? ""} />
    <div className="field"><label className="field-label" htmlFor={`p-name-${id}`}>Name</label><input id={`p-name-${id}`} name="fullName" className="field-control" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(checked.name)} />{checked.name && <span className="field-error" role="alert">{checked.name}</span>}</div>
    <div className="field"><label className="field-label" htmlFor={`p-phone-${id}`}>Phone (optional)</label><input id={`p-phone-${id}`} name="phone" type="tel" inputMode="tel" className="field-control" value={phone} maxLength={20} onChange={(event) => setPhone(event.target.value)} aria-invalid={Boolean(checked.phone)} />{checked.phone && <span className="field-error" role="alert">{checked.phone}</span>}</div>
    <div className="field"><MealChoice name="mealPreference" defaultValue={person?.meal_preference ?? ""} labels={MEAL_LABELS} /></div>
    <div className="field"><label className="field-label" htmlFor={`p-allergies-${id}`}>Allergies (optional)</label><input id={`p-allergies-${id}`} name="allergies" className="field-control" defaultValue={person?.allergies ?? ""} maxLength={500} /></div>
    <div className="field field-full"><label className="field-label" htmlFor={`p-help-${id}`}>Help they need (optional)</label><input id={`p-help-${id}`} name="assistanceNeeds" className="field-control" defaultValue={person?.assistance_needs ?? ""} maxLength={500} placeholder="For example, wheelchair access" /></div>
    {state.error && <p className="field-error field-full" role="alert">{state.error}</p>}
    <div className="doc-actions field-full"><Button type="submit" disabled={pending}>{pending ? "Saving…" : person ? "Save" : "Add person"}</Button><Button type="button" variant="quiet" onClick={onDone}>Cancel</Button></div>
  </form>;
}

type MenuItem = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };

/**
 * "More": a small menu that opens over the page below its button, so the row doesn't move.
 * Closes on choosing an item, Escape, or a tap outside; arrow keys move between items.
 */
function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  // Where the menu sits on screen. It is pinned to the window (not the table, which scrolls and
  // would clip it), right-aligned under the button, and opens upwards near the bottom of the screen.
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const open = place !== null;
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (open || !button.current) { setPlace(null); return; }
    const rect = button.current.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom;
    setPlace(below < 300 && rect.top > below ? { left, width, bottom: window.innerHeight - rect.top + 4 } : { left, width, top: rect.bottom + 4 });
  };
  const setOpen = (value: boolean) => { if (!value) setPlace(null); };
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const all = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      all[(at + (event.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
    };
    // The menu is pinned to the screen, so it closes if the page scrolls or resizes under it.
    const close = () => setPlace(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keys);
      window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close);
    };
  }, [open]);
  return <div className="desk-more" ref={box}>
    <button ref={button} type="button" className="desk-more-button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={toggle}>More</button>
    {place && <div className="desk-more-menu" role="menu" aria-label={label} style={place}>
      {items.map((item) => <button key={item.label} type="button" role="menuitem" className={item.danger ? "desk-danger" : undefined} disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }}>
        {item.danger && <Trash2 size={15} aria-hidden="true" />}{item.label}
      </button>)}
    </div>}
  </div>;
}
