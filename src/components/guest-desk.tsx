"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, MessageCircle, Send, UserRoundX, Users } from "lucide-react";
import { addFamiliesAction, prepareFamilyInviteAction, recordFamilyReminderAction, setFamilyInvitedAction, type AddFamiliesState } from "@/app/actions/guest-desk";
import { recordInvitationSharedAction } from "@/app/actions/invitations";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button, Card, DataTable, EmptyState } from "@/components/ui";
import type { GuestDesk as Desk } from "@/lib/data/guest-desk";
import { isLanguage, LANGUAGES, resolveTexts, shareMessage, whatsappUrl, type LanguageCode } from "@/lib/invitations/content";
import { reminderMessage } from "@/lib/invitations/reminder";
import { replyLabel, type FamilyRow } from "@/lib/planning/guest-desk";
import { MAX_FAMILIES_PER_PASTE } from "@/lib/planning/family-paste";
import { formatDate } from "@/lib/format";

const EXAMPLE = "Rao family, +91 98765 43210, 4\nPai family, , 2\nKamath family";
const lang = (value: string): LanguageCode => isLanguage(value) ? value : "en";

/** The invitation message in the family's language, with their link. Uses the default design's wording when there is one. */
function inviteText(desk: Desk, name: string, language: string, link: string) {
  return shareMessage(resolveTexts(lang(language), desk.design?.texts, true, desk.design?.kind ?? "invitation"), { name, couple: desk.coupleNames, link });
}

export function GuestDesk({ desk }: { desk: Desk }) {
  const invitedFamilies = desk.families.filter((row) => row.state !== "not_invited");
  const notInvited = desk.families.filter((row) => row.state === "not_invited");
  return <div className="section-stack guest-desk">
    <div className="guest-summary-grid" role="group" aria-label="Replies so far">
      <Tile label="Families invited" value={desk.totals.invited} />
      <Tile label="Replied" value={desk.totals.replied} />
      <Tile label="Not yet replied" value={desk.totals.waiting} />
    </div>
    {desk.canEdit ? <AddFamilies desk={desk} /> : <p className="field-help" role="note">You can see the list. To add families or send invitations, ask the couple to let you change guests.</p>}
    {desk.canEdit && !desk.design && <p className="travel-warning" role="note">No invitation design is chosen yet, so messages use the standard wording and sends can&apos;t be recorded. <Link href="/invitations">Choose a design on Invitations</Link>.</p>}
    <Card title="Families" subtitle="Families who haven't replied are at the top. Edit names and details on the People & RSVPs page.">
      {!invitedFamilies.length ? <EmptyState icon={<Users size={20} aria-hidden="true" />} title="No families invited yet" description={desk.canEdit ? "Paste your families above, one per line, to add and invite them in one go." : "Families appear here once the couple adds them."} />
        : <DataTable label="Families and their replies" className="stack-on-phone guest-desk-table" headers={["Family", "Phone", "People", "Reply", "Sent / opened", ""]}>
          {invitedFamilies.map((row) => <FamilyLine key={row.id} desk={desk} row={row} />)}
        </DataTable>}
      {notInvited.length > 0 && <details className="more-details"><summary>Not on the invite list ({notInvited.length})</summary>
        <ul className="doc-list">{notInvited.map((row) => <li key={row.id} className="reference-row"><span className="row-title">{row.name}</span><span className="row-meta">{row.people} {row.people === 1 ? "person" : "people"}{row.canPutBack ? " · removed" : " · not invited to anything"}</span>
          <span className="doc-actions">{desk.canEdit && row.canPutBack && <PutBack desk={desk} row={row} />}<Link className="button button-quiet" href={`/guests?q=${encodeURIComponent(row.name)}`}>Edit people</Link></span></li>)}</ul>
      </details>}
    </Card>
    <Card title="Headcount per function" subtitle="People, not families. “Waiting” means no reply yet.">
      {!desk.headcounts.length ? <p className="field-help">Add your functions on Plan → Functions to see headcounts.</p>
        : <DataTable label="Headcount per function" headers={["Function", "Yes", "Maybe", "No", "Waiting"]}>
          {desk.headcounts.map((row) => <tr key={row.id}><td className="table-primary">{row.name}</td><td>{row.yes}</td><td>{row.maybe}</td><td>{row.no}</td><td>{row.waiting}</td></tr>)}
        </DataTable>}
    </Card>
  </div>;
}

function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card stat-card"><p className="stat-label">{label}</p><p className="stat-value">{value}</p></div>;
}

/** The paste box. The text stays after a problem (React would otherwise reset the form), and clears once added. */
function AddFamilies({ desk }: { desk: Desk }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<string[]>(() => desk.functions.map((fn) => fn.id));
  const [side, setSide] = useState("unknown");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [state, action, pending] = useActionState(async (previous: AddFamiliesState, form: FormData) => {
    const result = await addFamiliesAction(previous, form);
    if (result.created) setText("");
    return result;
  }, {});
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  return <>
    <Card title="Add families" subtitle="Paste one family per line. Each family gets one private link that answers for everyone in it.">
      {!desk.functions.length ? <p className="field-help">Add your functions first on <Link href="/functions">Plan → Functions</Link>, then come back to invite families to them.</p> : <form action={action} className="section-stack desk-add-form">
        <input type="hidden" name="weddingId" value={desk.weddingId} />
        <div className="field">
          <label className="field-label" htmlFor="desk-families">Families</label>
          <textarea id="desk-families" name="families" className="field-control" rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder={EXAMPLE} aria-describedby="desk-families-help" aria-invalid={Boolean(state.problems?.length)} spellCheck={false} />
          <span className="field-help" id="desk-families-help">One family per line: <strong>name, phone, number of guests</strong>. Phone and number are optional; leave commas out of names. Up to {MAX_FAMILIES_PER_PASTE} at a time. Numbers like 98765 43210 get +91 added.{lines ? ` ${lines} line${lines === 1 ? "" : "s"}.` : ""}</span>
        </div>
        <fieldset className="starter-list family-invite-list"><legend className="field-label">Invite them to</legend>
          {desk.functions.map((fn) => <label key={fn.id} className="checkbox-row"><input type="checkbox" name="inviteTo" value={fn.id} checked={chosen.includes(fn.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, fn.id] : current.filter((value) => value !== fn.id))} /><span>{fn.name}{fn.date ? ` · ${formatDate(fn.date, desk.timezone)}` : ""}</span></label>)}
        </fieldset>
        <div className="field-grid">
          <div className="field"><label className="field-label" htmlFor="desk-side">Whose side</label>
            <select id="desk-side" name="familySide" className="field-control" value={side} onChange={(event) => setSide(event.target.value)}>
              {(["couple_one", "couple_two", "shared", "unknown"] as const).map((value) => <option key={value} value={value}>{desk.familySideLabels[value]}</option>)}
            </select></div>
          <div className="field"><label className="field-label" htmlFor="desk-language">Invitation language</label>
            <select id="desk-language" name="language" className="field-control" value={language} onChange={(event) => setLanguage(lang(event.target.value))}>
              {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}{item.draft ? " (draft wording)" : ""}</option>)}
            </select></div>
        </div>
        {state.problems?.length ? <div className="auth-alert" role="alert"><p><strong>Nothing was added.</strong> Fix {state.problems.length === 1 ? "this" : `these ${state.problems.length} problems`} and try again:</p><ul>{state.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div> : null}
        {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
        {state.message && <p className="auth-success" role="status">{state.message} Send their invitations below.</p>}
        <div className="form-actions"><Button type="submit" disabled={pending || !lines || !chosen.length}>{pending ? "Adding…" : "Add families"}</Button></div>
      </form>}
    </Card>
    {state.created?.length ? <SendNow key={state.at} desk={desk} created={state.created} /> : null}
  </>;
}

/** Right after adding: each family's new link, shown once, ready for WhatsApp. */
function SendNow({ desk, created }: { desk: Desk; created: NonNullable<AddFamiliesState["created"]> }) {
  const [origin] = useState(() => typeof window === "undefined" ? "" : window.location.origin);
  return <Card title="Send their invitations now" subtitle="These links are shown only on this page, once. If you leave, use “Invite on WhatsApp” on the list later; that makes a new link.">
    <ul className="doc-list">{created.map((row) => {
      const link = `${origin}/guest#${row.token}`;
      const message = inviteText(desk, row.name, row.language, link);
      return <li key={row.householdId} className="reference-row"><span className="row-title">{row.name}</span><span className="row-meta">{row.people} {row.people === 1 ? "person" : "people"}</span>
        <SendButtons desk={desk} guestId={row.leadGuestId} phone={row.phone} message={message} link={link} kind="invite" /></li>;
    })}</ul>
  </Card>;
}

/** Opens WhatsApp with the message, then records the send when the planner says they sent it. */
function SendButtons({ desk, guestId, phone, message, link, kind }: { desk: Desk; guestId: string; phone: string; message: string; link: string; kind: "invite" | "remind" }) {
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});
  const whatsapp = whatsappUrl(phone, message);
  const record = async () => {
    setBusy(true);
    const result = kind === "invite"
      ? desk.design ? await recordInvitationSharedAction({ weddingId: desk.weddingId, guestId, designId: desk.design.id, channel: "whatsapp", message, link }) : { error: "Choose an invitation design on Invitations to record sends." }
      : await recordFamilyReminderAction({ weddingId: desk.weddingId, guestId, message, link });
    setBusy(false); setStatus(result);
  };
  return <span className="doc-actions desk-send">
    <a className="button button-primary" href={whatsapp.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}><MessageCircle size={15} aria-hidden="true" /> Open WhatsApp</a>
    {status.message ? <span className="field-success" role="status"><Check size={14} aria-hidden="true" /> {status.message}</span>
      : <Button type="button" variant={opened ? "secondary" : "quiet"} disabled={busy} onClick={record}>{busy ? "Saving…" : "I sent it"}</Button>}
    {!whatsapp.hasNumber && <span className="field-help">No number starting with + is saved, so WhatsApp will ask you to pick the chat.</span>}
    {status.error && <span className="field-error" role="alert">{status.error}</span>}
  </span>;
}

const ago = (value: string | null, timezone: string) => value ? formatDate(value, timezone) : null;

function FamilyLine({ desk, row }: { desk: Desk; row: FamilyRow }) {
  const invited = ago(row.invitedAt, desk.timezone);
  const reminded = ago(row.remindedAt, desk.timezone);
  const opened = ago(row.openedAt, desk.timezone);
  return <tr>
    <td><span className="table-primary">{row.name}</span>{row.placeholders > 0 && <span className="table-secondary">{row.placeholders} without a name yet</span>}</td>
    <td>{row.phone ? <><span className="desk-cell-label">Phone: </span>{row.phone}</> : <span className="table-secondary">No phone</span>}</td>
    <td><span className="desk-cell-label">People: </span>{row.invitedPeople}{row.people > row.invitedPeople ? ` of ${row.people}` : ""}</td>
    <td><span className={`status ${row.state === "accepts" ? "status-confirmed" : row.state === "declines" ? "status-neutral" : "status-pending"}`}>{replyLabel(row)}</span></td>
    <td><span className="desk-cell-label">Sent / opened: </span><span className="table-secondary">{invited ? `Sent ${invited}` : "Not sent yet"}{reminded ? ` · reminded ${reminded}${row.reminders > 1 ? ` (${row.reminders}×)` : ""}` : ""}{opened ? ` · opened ${opened}` : invited ? " · not opened" : ""}</span></td>
    <td>{desk.canEdit ? <FamilyActions desk={desk} row={row} /> : <Link className="button button-quiet" href={`/guests?q=${encodeURIComponent(row.name)}`}>See people</Link>}</td>
  </tr>;
}

type Mode = null | "invite" | "remind";

function FamilyActions({ desk, row }: { desk: Desk; row: FamilyRow }) {
  const [mode, setMode] = useState<Mode>(null);
  const [confirm, setConfirm] = useState<null | "invite" | "fresh" | "remove">(null);
  const [link, setLink] = useState<{ url: string; guestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});
  const prepare = async (next: Mode) => {
    setConfirm(null); setBusy(true); setStatus({});
    const result = await prepareFamilyInviteAction(desk.weddingId, row.id);
    setBusy(false);
    if (!result.token || !result.leadGuestId) { setStatus({ error: result.error ?? "Couldn't make the link." }); return; }
    setLink({ url: `${window.location.origin}/guest#${result.token}`, guestId: result.leadGuestId });
    setMode(next);
  };
  const remove = async () => {
    setConfirm(null); setBusy(true);
    const result = await setFamilyInvitedAction(desk.weddingId, row.id, false);
    setBusy(false); setStatus(result);
  };
  const close = () => { setMode(null); setLink(null); };
  return <div className="desk-actions">
    {!mode && <div className="doc-actions">
      <Button type="button" disabled={busy || !row.leadId} onClick={() => row.linkActive || row.invitedAt ? setConfirm("invite") : prepare("invite")}><Send size={15} aria-hidden="true" /> {busy ? "Preparing…" : row.invitedAt ? "Invite again" : "Invite on WhatsApp"}</Button>
      {row.state === "not_yet" && row.invitedAt && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setLink(null); setMode("remind"); }}>Remind</Button>}
      <details className="desk-more"><summary>More</summary>
        <Link className="button button-quiet" href={`/guests?q=${encodeURIComponent(row.name)}`}>Edit people</Link>
        <Link className="button button-quiet" href="/invitations">Open in Invitations</Link>
        <Button type="button" variant="quiet" disabled={busy} onClick={() => setConfirm("remove")}><UserRoundX size={15} aria-hidden="true" /> Remove from list</Button>
      </details>
    </div>}
    {mode === "invite" && link && <div className="desk-panel">
      <p className="field-help">New link ready for {row.name}. It answers for everyone in the family and works for 30 days.</p>
      <SendButtons desk={desk} guestId={link.guestId} phone={row.phone} message={inviteText(desk, row.name, row.language, link.url)} link={link.url} kind="invite" />
      <Button type="button" variant="quiet" onClick={close}>Done</Button>
    </div>}
    {mode === "remind" && <div className="desk-panel">
      {link ? <>
        <p className="field-help">Fresh link ready. The old one no longer works.</p>
        <SendButtons desk={desk} guestId={link.guestId} phone={row.phone} message={reminderMessage(lang(row.language), { name: row.name, couple: desk.coupleNames, link: link.url })} link={link.url} kind="remind" />
      </> : <>
        <p className="field-label">How do you want to remind {row.name}?</p>
        {row.linkActive && row.leadId ? <div className="desk-choice">
          <p className="field-help">Remind them, asking them to use the link they already have{row.linkExpiresAt ? ` (works until ${formatDate(row.linkExpiresAt, desk.timezone)})` : ""}.</p>
          <SendButtons desk={desk} guestId={row.leadId} phone={row.phone} message={reminderMessage(lang(row.language), { name: row.name, couple: desk.coupleNames })} link="" kind="remind" />
        </div> : <p className="field-help">Their link has expired or was replaced, so send a fresh one.</p>}
        <div className="desk-choice"><Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirm("fresh")}>{busy ? "Preparing…" : "Send a fresh link"}</Button></div>
      </>}
      <Button type="button" variant="quiet" onClick={close}>Close</Button>
    </div>}
    {status.error && <p className="field-error" role="alert">{status.error}</p>}
    {status.message && <p className="field-success" role="status">{status.message}</p>}
    <ConfirmationDialog open={confirm === "invite" || confirm === "fresh"} title={confirm === "fresh" ? `Send ${row.name} a fresh link?` : `Make a new link for ${row.name}?`}
      description={`This creates a new private link for ${row.leadName}, answering for the whole family. Any previous link for this person stops working.`}
      confirmLabel="Make new link" confirmDisabled={busy} onConfirm={() => prepare(confirm === "fresh" ? "remind" : "invite")} onCancel={() => setConfirm(null)} />
    <ConfirmationDialog open={confirm === "remove"} title={`Remove ${row.name} from the list?`}
      description="Their invitations are withdrawn and their link stops working. The people and any replies they gave are kept, and you can put them back later. To delete them completely, use People & RSVPs."
      confirmLabel="Remove from list" confirmDisabled={busy} onConfirm={remove} onCancel={() => setConfirm(null)} />
  </div>;
}

function PutBack({ desk, row }: { desk: Desk; row: FamilyRow }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});
  return <>
    <Button type="button" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); setStatus(await setFamilyInvitedAction(desk.weddingId, row.id, true)); setBusy(false); }}>{busy ? "Putting back…" : "Put back"}</Button>
    {status.error && <span className="field-error" role="alert">{status.error}</span>}
    {status.message && <span className="field-success" role="status">{status.message}</span>}
  </>;
}
