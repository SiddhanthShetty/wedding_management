"use client";
import { useMemo, useState } from "react";
import { Copy, Download, Info } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Select, TextArea, TextInput } from "@/components/form-fields";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createCsv } from "@/lib/planning/guest-csv";
import { CHANNEL_LABELS, KIND_LABELS, MESSAGE_STATE_LABELS, PLACEHOLDERS, renderTemplate, selectRecipients, unknownPlaceholders, type MessageKind, type Placeholder } from "@/lib/planning/communications";
import type { CommunicationsWorkspace } from "@/lib/data/communications";
import { archiveTemplateAction, recordMessagesAction, saveTemplateAction, setRecordStateAction } from "@/app/actions/communications";

type Data = CommunicationsWorkspace;
type Template = Data["templates"][number];

const DEFAULT_BODIES: Record<MessageKind, string> = {
  invitation: "Dear {{first_name}},\n\n{{couple_names}} would love you to join them for {{function_name}} on {{function_date}} at {{venue}}.\n\nPlease reply using the private invitation link your hosts shared with your household.",
  reminder: "Hi {{first_name}}, a gentle reminder to let {{couple_names}} know whether you can attend {{function_name}} on {{function_date}}. Thank you!",
  update: "Hi {{first_name}}, an update about {{function_name}} on {{function_date}}: ",
};

function TemplateForm({ data, template }: { data: Data; template?: Template }) {
  const [kind, setKind] = useState<MessageKind>(template?.kind ?? "invitation");
  const [body, setBody] = useState(template?.body ?? DEFAULT_BODIES.invitation);
  const [subject, setSubject] = useState(template?.subject ?? "");
  const unknown = unknownPlaceholders(`${subject}\n${body}`);
  return <ActionForm action={saveTemplateAction} submitLabel={template ? "Save template" : "Create template"} className="field-grid" resetOnSuccess={!template}>
    <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="templateId" value={template?.id ?? ""} /><input type="hidden" name="version" value={template?.version ?? ""} />
    <Select label="Type" name="kind" value={kind} onChange={(event) => { const next = event.target.value as MessageKind; setKind(next); if (!template && body === DEFAULT_BODIES[kind]) setBody(DEFAULT_BODIES[next]); }}>
      {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Select>
    <TextInput label="Template name" name="name" required maxLength={120} defaultValue={template?.name} />
    <Select label="Default function" name="function_id" defaultValue={template?.function_id ?? ""}><option value="">Any function</option>{data.functions.map((fn) => <option key={fn.id} value={fn.id}>{fn.name}</option>)}</Select>
    <TextInput label="Subject (email)" name="subject" maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} />
    <TextArea label="Message" name="body" required rows={6} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} className="field-full"
      hint={`Placeholders: ${PLACEHOLDERS.map((name) => `{{${name}}}`).join(" ")}. Private invitation links cannot be inserted: they are shown once when created and are not stored.`} />
    {unknown.length > 0 && <p className="field-error field-full" role="alert">Unknown placeholder(s): {unknown.map((name) => `{{${name}}}`).join(", ")}</p>}
  </ActionForm>;
}

export function MessagesManager({ data }: { data: Data }) {
  const active = data.templates.filter((template) => !template.archived_at);
  const [templateId, setTemplateId] = useState(active[0]?.id ?? "");
  const template = data.templates.find((row) => row.id === templateId);
  const [functionId, setFunctionId] = useState(template?.function_id ?? data.functions[0]?.id ?? "");
  const [showExcluded, setShowExcluded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fn = data.functions.find((row) => row.id === functionId);
  const guestById = useMemo(() => new Map(data.guests.map((guest) => [guest.id, guest])), [data.guests]);
  const households = useMemo(() => new Map(data.households.map((row) => [row.id, row])), [data.households]);
  const recipients = useMemo(() => template && fn ? selectRecipients({
    kind: template.kind, functionId: fn.id, functionCancelled: fn.status === "cancelled", templateId: template.id,
    guests: data.guests, invitations: data.invitations, respondedInvitationIds: new Set(data.respondedInvitationIds), records: data.records,
    householdContact: new Map(data.households.map((row) => [row.id, { email: row.contact_email, phone: row.contact_phone }])),
  }) : [], [template, fn, data]);
  const included = recipients.filter((row) => row.included);
  const render = (text: string, guestId: string) => {
    const guest = guestById.get(guestId)!;
    const values: Partial<Record<Placeholder, string | null>> = {
      guest_name: guest.full_name, first_name: guest.full_name.split(" ")[0] ?? guest.full_name, household_name: guest.household_id ? households.get(guest.household_id)?.name ?? null : null,
      function_name: fn?.name ?? null, function_date: fn?.function_date ? new Intl.DateTimeFormat("en-IE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${fn.function_date}T12:00:00Z`)) : null,
      function_time: fn?.start_time?.slice(0, 5) ?? null, venue: fn?.venue_name ?? null, couple_names: data.coupleNames || null,
    };
    return renderTemplate(text, values);
  };
  const contact = (guestId: string) => { const guest = guestById.get(guestId)!; const household = guest.household_id ? households.get(guest.household_id) : undefined; return { email: guest.email || household?.contact_email || "", phone: guest.phone || household?.contact_phone || "" }; };
  const copy = async (key: string, value: string) => { try { await navigator.clipboard.writeText(value); setCopied(key); } catch { setCopied(null); window.prompt("Copy this message:", value); } };
  const exportDrafts = () => {
    if (!template) return;
    const csv = createCsv(["guest", "email", "phone", "subject", "message"], included.map((row) => ({ guest: guestById.get(row.guestId)?.full_name, ...contact(row.guestId), subject: render(template.subject, row.guestId), message: render(template.body, row.guestId) })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `draft-messages-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const tz = data.wedding.timezone;
  return <div className="section-stack">
    <PageHeading eyebrow="Guest communication" title="Messages" description="Prepare invitations, reminders and updates. Nothing is sent from this app: copy or export messages, send them yourself, then record what you sent." />
    <p className="demo-note" role="note"><Info size={15} aria-hidden="true" /> “Marked sent manually” means a member says they sent it. It does not confirm delivery. Delivery confirmation needs a messaging provider, which is not connected.</p>
    {data.canEdit && <Card title="New template"><TemplateForm data={data} /></Card>}
    {!data.templates.length ? <Card><EmptyState title="No templates yet" description="Create an invitation or reminder template to preview recipients and prepare messages." /></Card> : <>
      <Card title="Prepare messages" subtitle="Choose a template and function to see who needs the message and why others are excluded.">
        <div className="field-grid">
          <Select label="Template" value={templateId} onChange={(event) => { setTemplateId(event.target.value); const next = data.templates.find((row) => row.id === event.target.value); if (next?.function_id) setFunctionId(next.function_id); }}>
            {active.map((row) => <option key={row.id} value={row.id}>{row.name} · {KIND_LABELS[row.kind]}</option>)}
          </Select>
          <Select label="Function" value={functionId} onChange={(event) => setFunctionId(event.target.value)}>{data.functions.map((row) => <option key={row.id} value={row.id}>{row.name}{row.status === "cancelled" ? " (cancelled)" : ""}</option>)}</Select>
        </div>
        {!template || !fn ? <EmptyState title="Choose a template and function" description="Both are needed to preview recipients." /> : <>
          <p className="row-meta" role="status">{included.length} need this message · {recipients.length - included.length} excluded</p>
          <div className="doc-actions">
            <button type="button" className="button button-secondary" onClick={exportDrafts} disabled={!included.length}><Download size={15} aria-hidden="true" /> Export drafts (CSV)</button>
            <button type="button" className={`chip ${showExcluded ? "is-active" : ""}`} aria-pressed={showExcluded} onClick={() => setShowExcluded(!showExcluded)}>Show excluded</button>
          </div>
          {data.canEdit && included.length > 0 && <ActionForm action={recordMessagesAction} submitLabel="Record for selected recipients" className="field-grid">
            <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="templateId" value={template.id} /><input type="hidden" name="functionId" value={fn.id} />
            {included.map((row) => <input key={row.guestId} type="hidden" name="guestIds" value={row.guestId} />)}
            <Select label="What happened" name="state" defaultValue="drafted"><option value="drafted">Save as drafts</option><option value="sent">I sent these myself (mark sent manually)</option></Select>
            <Select label="Channel" name="channel" defaultValue="email">{Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <TextInput label="Notes" name="notes" maxLength={2000} className="field-full" />
          </ActionForm>}
          <ul className="doc-list">{recipients.filter((row) => row.included || showExcluded).map((row) => {
            const guest = guestById.get(row.guestId)!; const subject = render(template.subject, row.guestId); const body = render(template.body, row.guestId); const reach = contact(row.guestId);
            return <li key={row.guestId} className={`travel-guest ${row.included ? "" : "is-muted"}`}>
              <div className="ops-head"><h3 className="row-title">{guest.full_name}</h3><span className={`status status-${row.included ? "pending" : "neutral"}`}>{row.reason}</span></div>
              <p className="row-meta">{[reach.email, reach.phone].filter(Boolean).join(" · ") || "No email or phone on record"}</p>
              {row.included && <>{subject && <p className="row-meta"><strong>Subject:</strong> {subject}</p>}<p className="message-preview">{body}</p>
                <button type="button" className="button button-quiet" onClick={() => copy(row.guestId, subject ? `${subject}\n\n${body}` : body)}><Copy size={14} aria-hidden="true" /> {copied === row.guestId ? "Copied" : "Copy message"}</button></>}
            </li>;
          })}</ul>
        </>}
      </Card>
      <Card title="Templates">
        <ul className="doc-list">{data.templates.map((row) => <li key={row.id} className={`travel-guest ${row.archived_at ? "is-muted" : ""}`}>
          <div className="ops-head"><h3 className="row-title">{row.name}</h3><span className="status status-neutral">{KIND_LABELS[row.kind]}</span>{row.archived_at && <span className="status status-cancelled">Archived</span>}</div>
          {data.canEdit && <details className="travel-edit"><summary>Edit or archive</summary>
            {!row.archived_at && <TemplateForm data={data} template={row} />}
            <ActionForm action={archiveTemplateAction} submitLabel={row.archived_at ? "Restore template" : "Archive template"} variant="quiet">
              <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="templateId" value={row.id} /><input type="hidden" name="archived" value={String(!row.archived_at)} />
            </ActionForm>
          </details>}
        </li>)}</ul>
      </Card>
    </>}
    <Card title="Message log" subtitle={`States: ${Object.values(MESSAGE_STATE_LABELS).join(" · ")}. Loaded ${formatDateTime(data.loadedAt, tz)}.`}>
      {!data.records.length ? <EmptyState title="No messages recorded" description="Drafts and manually sent messages appear here." /> :
        <div className="table-scroll"><table className="data-table"><caption className="sr-only">Message log</caption>
          <thead><tr><th scope="col">Guest</th><th scope="col">Function</th><th scope="col">Channel</th><th scope="col">State</th><th scope="col">When</th>{data.canEdit && <th scope="col">Update</th>}</tr></thead>
          <tbody>{data.records.slice(0, 300).map((record) => <tr key={record.id}>
            <td><span className="table-primary">{guestById.get(record.guest_id)?.full_name ?? "Guest"}</span><span className="table-secondary">{record.subject || record.body_snapshot.slice(0, 60)}</span></td>
            <td>{data.functions.find((row) => row.id === record.function_id)?.name ?? "—"}</td>
            <td>{CHANNEL_LABELS[record.channel]}</td>
            <td>{MESSAGE_STATE_LABELS[record.state]}{record.failure_reason && <span className="table-secondary">{record.failure_reason}</span>}</td>
            <td>{formatDateTime(record.sent_at ?? record.updated_at, tz)}</td>
            {data.canEdit && <td>{record.state === "drafted" ? <div className="doc-actions">
              <ActionForm action={setRecordStateAction} submitLabel="Mark sent manually" variant="quiet" className="inline-action-form"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="recordId" value={record.id} /><input type="hidden" name="to" value="sent" /></ActionForm>
              <ActionForm action={setRecordStateAction} submitLabel="Mark failed" variant="quiet" className="inline-action-form"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="recordId" value={record.id} /><input type="hidden" name="to" value="failed" /><TextInput label="Why it failed" name="failureReason" required maxLength={1000} /></ActionForm>
            </div> : record.state === "failed" ? <ActionForm action={setRecordStateAction} submitLabel="Back to draft" variant="quiet" className="inline-action-form"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="recordId" value={record.id} /><input type="hidden" name="to" value="drafted" /></ActionForm> : "—"}</td>}
          </tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
