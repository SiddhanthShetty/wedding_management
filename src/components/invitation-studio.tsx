"use client";
import { useMemo, useRef, useState } from "react";
import { Copy, Download, Mail, MessageCircle, Palette, Send, Share2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { InvitationCard } from "@/components/invitation-card";
import { Checkbox, Select, TextArea, TextInput } from "@/components/form-fields";
import { TabList } from "@/components/tab-list";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { buildCardProps } from "@/lib/invitations/card-data";
import { DEFAULT_TEXTS, LANGUAGES, isLanguage, mailtoUrl, resolveTexts, shareMessage, TEXT_KEYS, TEXT_LABELS, THEMES, themeById, whatsappUrl, type LanguageCode, type TextOverrides, type ThemeId } from "@/lib/invitations/content";
import { cardFileName, svgElementToPng } from "@/lib/invitations/export-card";
import type { InvitationWorkspace } from "@/lib/data/invitations";
import { createMissingLinksAction } from "@/app/actions/bulk";
import { prepareInvitationAction, recordInvitationSharedAction, saveDesignAction, setDefaultDesignAction } from "@/app/actions/invitations";

type Data = InvitationWorkspace;
type Design = Data["designs"][number];
type Household = Data["households"][number];
type Guest = Data["guests"][number];
type Tab = "design" | "send";

export function InvitationStudio({ data }: { data: Data }) {
  const [tab, setTab] = useState<Tab>(data.designs.length ? "send" : "design");
  const defaultDesign = data.designs.find((design) => design.is_default) ?? data.designs[0];
  const invitedGuests = useMemo(() => data.guests.filter((guest) => data.invitations.some((invitation) => invitation.guest_id === guest.id)), [data]);
  return <div className="section-stack invitations-page">
    <PageHeading eyebrow="Guests" title="Invitations" description="Design a personalised invitation once, then prepare a private RSVP link for each invited person. Nothing is sent automatically." />
    <TabList tabs={[{ id: "design" as Tab, label: "Design", icon: Palette }, { id: "send" as Tab, label: "Share with guests", icon: Send }]} selected={tab} onSelect={setTab} label="Invitation sections" idPrefix="invite" />
    <section role="tabpanel" id={`invite-panel-${tab}`} aria-labelledby={`invite-tab-${tab}`} tabIndex={0} className="section-stack">
      {tab === "design" ? <DesignStudio data={data} guests={invitedGuests} /> : !defaultDesign
        ? <Card><EmptyState title="Create a design first" description="Choose a theme and wording on the Design tab. Then come back here to share it." /></Card>
        : <SendPanel data={data} design={defaultDesign} guests={invitedGuests} />}
    </section>
  </div>;
}

function DesignStudio({ data, guests }: { data: Data; guests: Guest[] }) {
  const [designId, setDesignId] = useState(data.designs.find((design) => design.is_default)?.id ?? data.designs[0]?.id ?? "new");
  const design = data.designs.find((row) => row.id === designId);
  return <>
    {data.designs.length > 0 && <Card>
      <div className="field-grid">
        <Select label="Design" value={designId} onChange={(event) => setDesignId(event.target.value)}>
          {data.designs.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_default ? " (guests see this)" : ""}</option>)}
          {data.canEdit && <option value="new">+ New design</option>}
        </Select>
        {design && !design.is_default && data.canEdit && <ActionForm action={setDefaultDesignAction} submitLabel="Show this design to guests" className="inline-action-form">
          <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="designId" value={design.id} />
        </ActionForm>}
      </div>
    </Card>}
    <DesignEditor key={designId} data={data} design={design} guests={guests} />
  </>;
}

function DesignEditor({ data, design, guests }: { data: Data; design?: Design; guests: Guest[] }) {
  const [name, setName] = useState(design?.name ?? "Our invitation");
  const [theme, setTheme] = useState<ThemeId>(design?.theme ?? "mallige");
  const [useAccent, setUseAccent] = useState(Boolean(design?.accent));
  const [accent, setAccent] = useState(design?.accent ?? themeById(design?.theme ?? "mallige").accent);
  const [texts, setTexts] = useState<TextOverrides>(design?.texts ?? {});
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [previewId, setPreviewId] = useState(guests[0]?.id ?? "");
  const previewDesign = { theme, accent: useAccent ? accent : null, texts };
  const previewGuest = guests.find((row) => row.id === previewId);
  const card = previewGuest ? guestCard(data, previewDesign, previewGuest, language) : buildCardProps({ ...previewDesign, overrides: texts, language, couple: data.coupleNames, greetingName: "Guest name", functions: data.functions.slice(0, 3) });
  const languageInfo = LANGUAGES.find((item) => item.code === language)!;
  const setText = (key: typeof TEXT_KEYS[number], value: string) => setTexts((current) => ({ ...current, [language]: { ...current[language], [key]: value } }));
  return <div className="invite-editor">
    <Card title="Preview" subtitle="Exactly what the selected guest will receive.">
      <div className="field-grid">
        <Select label="Preview as" value={previewId} onChange={(event) => setPreviewId(event.target.value)}>
          {!guests.length && <option value="">Sample guest</option>}
          {guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.full_name}</option>)}
        </Select>
        <Select label="Language" value={language} onChange={(event) => setLanguage(event.target.value as LanguageCode)}>{LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</Select>
      </div>
      <div className="invite-preview"><InvitationCard {...card} /></div>
    </Card>
    <Card title="Theme and wording">
      {!data.canEdit && <p className="readonly-note">You can preview designs. Guest-list edit access is needed to change them.</p>}
      <fieldset className="theme-picker" disabled={!data.canEdit}>
        <legend className="field-label">Theme</legend>
        {THEMES.map((option) => <label key={option.id} className={`theme-option ${theme === option.id ? "is-selected" : ""}`}>
          <input type="radio" name="theme-choice" value={option.id} checked={theme === option.id} onChange={() => { setTheme(option.id); if (!useAccent) setAccent(option.accent); }} />
          <span className="theme-swatch" style={{ background: option.background, borderColor: option.accent }} aria-hidden="true"><span style={{ background: option.accent }} /></span>
          <span><strong>{option.name}</strong><span className="row-meta">{option.description}</span></span>
        </label>)}
      </fieldset>
      <ActionForm action={saveDesignAction} submitLabel={design ? "Save design" : "Create design"} className="field-grid">
        <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="designId" value={design?.id ?? ""} /><input type="hidden" name="version" value={design?.version ?? ""} />
        <input type="hidden" name="theme" value={theme} /><input type="hidden" name="texts" value={JSON.stringify(texts)} />
        <TextInput label="Design name" name="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={!data.canEdit} />
        <div className="field">
          <Checkbox label="Use my own accent colour" name="useAccent" checked={useAccent} onChange={(event) => setUseAccent(event.target.checked)} disabled={!data.canEdit} />
          {useAccent && <TextInput label="Accent colour" name="accent" type="color" value={accent} onChange={(event) => setAccent(event.target.value)} />}
        </div>
        <fieldset className="field-full wording" disabled={!data.canEdit}>
          <legend className="field-label">Wording in {languageInfo.label}</legend>
          {languageInfo.draft && <p className="travel-warning">The built-in {languageInfo.label} wording is a draft. Please have a native speaker check it{language === "tcy" ? ", especially Tulu" : ""}. Edit any line below.</p>}
          <p className="field-help">Use {"{{name}}"} for the invited person, {"{{couple}}"} for your names and {"{{link}}"} for that person's private RSVP link. Leave a line blank to use the default shown.</p>
          {TEXT_KEYS.map((key) => <TextArea key={`${language}-${key}`} label={TEXT_LABELS[key]} rows={key === "share" || key === "body" ? 3 : 1} maxLength={600} lang={language}
            value={texts[language]?.[key] ?? ""} placeholder={DEFAULT_TEXTS[language][key]} onChange={(event) => setText(key, event.target.value)} />)}
        </fieldset>
      </ActionForm>
    </Card>
  </div>;
}

function guestHousehold(data: Data, guest: Guest) { return data.households.find((household) => household.id === guest.household_id); }
function guestFunctions(data: Data, guest: Guest) {
  const invited = new Set(data.invitations.filter((row) => row.guest_id === guest.id).map((row) => row.function_id));
  return data.functions.filter((fn) => invited.has(fn.id));
}
function guestCard(data: Data, design: Pick<Design, "theme" | "accent" | "texts">, guest: Guest, language: LanguageCode) {
  return buildCardProps({ theme: design.theme, accent: design.accent, overrides: design.texts, language, couple: data.coupleNames, greetingName: guest.full_name, functions: guestFunctions(data, guest) });
}

function SendPanel({ data, design, guests }: { data: Data; design: Design; guests: Guest[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const shown = guests.filter((guest) => `${guest.full_name} ${guest.email} ${guest.phone}`.toLowerCase().includes(query.toLowerCase()));
  const sentFor = (guest: Guest) => data.sent.filter((row) => row.guest_id === guest.id && row.dedupe_key.startsWith(`invite:${design.id}:`));
  if (!guests.length) return <Card><EmptyState title="Nobody is invited yet" description="Invite people to a function on the Guest list page before preparing their private links." /></Card>;
  const done = guests.filter((guest) => sentFor(guest).length > 0).length;
  return <>{data.canEdit && <BulkLinks data={data} design={design} />}<Card title={`Share “${design.name}”`} subtitle={`${done} of ${guests.length} guests recorded as sent. Each person has a separate card and private link.`}>
    <TextInput label="Find an individual guest" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
    <ul className="doc-list">{shown.map((guest) => {
      const sent = sentFor(guest);
      const household = guestHousehold(data, guest);
      const contact = { phone: guest.phone, email: guest.email };
      return <li key={guest.id} className="travel-guest">
        <div className="ops-head"><h3 className="row-title">{guest.full_name}</h3>{sent.length ? <span className="status status-confirmed">✓ Sent manually · {[...new Set(sent.map((row) => row.channel))].join(", ")}</span> : <span className="status status-pending">Not sent yet</span>}</div>
        <p className="row-meta">{guestFunctions(data, guest).map((fn) => fn.name).join(", ")} · {household?.name ?? "No household"} · {[contact.phone, contact.email].filter(Boolean).join(" · ") || "No individual phone or email on record"}{sent[0]?.sent_at ? ` · last ${formatDateTime(sent[0].sent_at, data.wedding.timezone)}` : ""}</p>
        {data.canEdit && <div className="doc-actions">
          {open !== guest.id && <button type="button" className="button button-primary" onClick={() => setOpen(guest.id)}><Share2 size={15} aria-hidden="true" /> Prepare individual invitation</button>}
        </div>}
        {open === guest.id && <SharePanel data={data} design={design} guest={guest} household={household} contact={contact} onClose={() => setOpen(null)} />}
      </li>;
    })}</ul>
  </Card></>;
}

/** Creates links for every invited person without an active one, and lists them once for sharing. */
function BulkLinks({ data, design }: { data: Data; design: Design }) {
  const [links, setLinks] = useState<Array<{ guestId: string; name: string; householdId: string | null; language: string; email: string; phone: string; token: string }> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true); setError("");
    const result = await createMissingLinksAction(data.wedding.id);
    setBusy(false);
    if (result.error) setError(result.error); else setLinks(result.links ?? []);
  };
  return <Card title="Individual links for invited guests" subtitle="Creates a separate private link for every invited person who does not already have one. Existing active links are left alone.">
    {!links ? <>
      <button type="button" className="button button-secondary" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create missing links"}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </> : !links.length ? <p className="field-help" role="status">Every invited person already has an active link.</p> : <>
      <p className="travel-warning" role="status">{links.length} link(s) created. They are shown only now; share each link with that person before leaving this page.</p>
      <ul className="doc-list">{links.map((row) => {
        const url = `${window.location.origin}/guest#${row.token}`;
        const message = shareMessage(resolveTexts(isLanguage(row.language) ? row.language : "en", design.texts), { name: row.name, couple: data.coupleNames, link: url });
        const contact = { phone: row.phone, email: row.email };
        return <li key={row.guestId} className="reference-row"><span className="row-title">{row.name}</span><span className="doc-actions">
          <a className="button button-quiet" href={whatsappUrl(contact.phone, message).url} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} aria-hidden="true" /> WhatsApp</a>
          <a className="button button-quiet" href={mailtoUrl(contact.email, `${data.coupleNames} · Wedding invitation`, message)}><Mail size={14} aria-hidden="true" /> Email</a>
          <button type="button" className="button button-quiet" onClick={() => navigator.clipboard?.writeText(message)}><Copy size={14} aria-hidden="true" /> Copy</button>
          <RecordSent data={data} design={design} guestId={row.guestId} message={message} link={url} />
        </span></li>;
      })}</ul>
      <p className="field-help">Each link is shown only once here. Replacing a guest's link revokes the previous one. Record manual sending against the individual guest.</p>
    </>}
  </Card>;
}

function SharePanel({ data, design, guest, household, contact, onClose }: { data: Data; design: Design; guest: Guest; household?: Household; contact: { phone: string; email: string }; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ error?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);
  const language = household?.preferred_language ?? "en";
  const card = guestCard(data, design, guest, language);
  const texts = resolveTexts(language, design.texts);
  const prepare = async () => {
    setBusy(true); setStatus({});
    const result = await prepareInvitationAction(data.wedding.id, guest.id);
    setBusy(false);
    if (!result.token) { setStatus({ error: result.error ?? "Could not create the private link." }); return; }
    const url = `${window.location.origin}/guest#${result.token}`;
    setLink(url);
    setMessage(shareMessage(texts, { name: guest.full_name, couple: data.coupleNames, link: url }));
  };
  const png = async () => {
    const svg = cardRef.current?.querySelector("svg");
    if (!svg) throw new Error("The card is not ready.");
    return new File([await svgElementToPng(svg)], cardFileName(guest.full_name), { type: "image/png" });
  };
  const share = async () => {
    try {
      const file = await png();
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: message }); setStatus({ message: "Shared. Record which app you used below." }); }
      else setStatus({ error: "This browser cannot share images. Use WhatsApp or Email below and attach the downloaded card." });
    } catch (error) { if ((error as Error).name !== "AbortError") setStatus({ error: (error as Error).message || "Sharing failed. Nothing was sent." }); }
  };
  const download = async () => {
    try { const file = await png(); const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.name; anchor.click(); URL.revokeObjectURL(url); }
    catch (error) { setStatus({ error: (error as Error).message }); }
  };
  const record = async (channel: "whatsapp" | "email" | "other") => {
    if (!link) return;
    setBusy(true);
    const result = await recordInvitationSharedAction({ weddingId: data.wedding.id, guestId: guest.id, designId: design.id, channel, message, link });
    setBusy(false); setStatus(result);
  };
  const whatsapp = whatsappUrl(contact.phone, message);
  return <div className="share-panel">
    <div className="invite-preview small" ref={cardRef}><InvitationCard {...card} /></div>
    <div className="section-stack">
      {!link ? <>
        <p className="travel-warning">This creates a private link for {guest.full_name}. Any previous link for this person stops working. Proxy access is granted separately from the Guests page.</p>
        <div className="doc-actions"><button type="button" className="button button-primary" disabled={busy} onClick={prepare}>{busy ? "Preparing…" : "Create link and prepare message"}</button><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button></div>
      </> : <>
        <TextArea label="Message (you can edit it before sharing)" rows={5} value={message} onChange={(event) => setMessage(event.target.value)} lang={language} hint="Contains this person's private link. Send it only to the intended guest." />
        <div className="doc-actions">
          <button type="button" className="button button-primary" onClick={share}><Share2 size={15} aria-hidden="true" /> Share card & message</button>
          <a className="button button-secondary" href={whatsapp.url} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" /> WhatsApp</a>
          <a className="button button-secondary" href={mailtoUrl(contact.email, `${data.coupleNames} · Wedding invitation`, message)}><Mail size={15} aria-hidden="true" /> Email</a>
          <button type="button" className="button button-secondary" onClick={() => navigator.clipboard?.writeText(message).then(() => setStatus({ message: "Message copied." }), () => setStatus({ error: "Copy failed; select the text instead." }))}><Copy size={15} aria-hidden="true" /> Copy</button>
          <button type="button" className="button button-secondary" onClick={download}><Download size={15} aria-hidden="true" /> Card image</button>
        </div>
        {!whatsapp.hasNumber && <p className="field-help">No international phone number (starting with +) is saved, so WhatsApp will ask you to pick the contact.</p>}
        <p className="field-help">WhatsApp and email links carry the text only. Attach the card image yourself, or use “Share card & message” on a phone.</p>
        <div className="doc-actions" role="group" aria-label="Record how you sent it">
          <span className="field-label">I sent it via</span>
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => record("whatsapp")}>WhatsApp</button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => record("email")}>Email</button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => record("other")}>Other</button>
          <button type="button" className="button button-quiet" onClick={onClose}>Close</button>
        </div>
      </>}
      {status.error && <p className="field-error" role="alert">{status.error}</p>}
      {!status.error && status.message && <p className="field-success" role="status">{status.message}</p>}
    </div>
  </div>;
}

function RecordSent({ data, design, guestId, message, link }: { data: Data; design: Design; guestId: string; message: string; link: string }) {
  const [channel, setChannel] = useState<"whatsapp" | "email" | "other">("whatsapp");
  const [status, setStatus] = useState<{ error?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);
  if (status.message) return <span className="field-success" role="status">{status.message}</span>;
  return <span className="inline-action-form">
    <label className="sr-only" htmlFor={`sent-${guestId}`}>Sent via</label>
    <select id={`sent-${guestId}`} className="field-control" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="other">Other</option></select>
    <button type="button" className="button button-quiet" disabled={busy} onClick={async () => { setBusy(true); setStatus(await recordInvitationSharedAction({ weddingId: data.wedding.id, guestId, designId: design.id, channel, message, link })); setBusy(false); }}>Mark sent</button>
    {status.error && <span className="field-error" role="alert">{status.error}</span>}
  </span>;
}
