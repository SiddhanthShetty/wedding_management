"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Select, TextArea, TextInput } from "@/components/form-fields";
import { Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { BLESSING_PRESETS, type Faq, type InfoCard, type InvitationSite, type StoryMoment } from "@/lib/invitations/site";
import type { InvitationWorkspace } from "@/lib/data/invitations";
import { moderateBlessingAction } from "@/app/actions/invitations";

type Data = InvitationWorkspace;
type Update = <K extends keyof InvitationSite>(key: K, value: InvitationSite[K]) => void;

/** Save the Date: the wedding date (required) and the place. */
export function SaveTheDateFields({ site, update, readOnly }: { site: InvitationSite; update: Update; readOnly: boolean }) {
  return <Group title="Date and place" summary={site.save_the_date.date || "Choose the date"} open>
    <fieldset className="field-grid" disabled={readOnly}>
      <TextInput label="Wedding date" type="date" required value={site.save_the_date.date} onChange={(event) => update("save_the_date", { ...site.save_the_date, date: event.target.value })} hint="Shown large on the card, with a countdown and an all-day calendar entry for guests." />
      <TextInput label="City or place" maxLength={60} value={site.save_the_date.city} onChange={(event) => update("save_the_date", { ...site.save_the_date, city: event.target.value })} placeholder="Udupi" />
    </fieldset>
  </Group>;
}

/** One collapsible group of the Content step. */
function Group({ title, summary, children, open = false }: { title: string; summary: string; children: React.ReactNode; open?: boolean }) {
  return <details className="studio-group" open={open}>
    <summary><span className="studio-group-title">{title}</span><span className="studio-group-summary">{summary}</span></summary>
    <div className="studio-group-body">{children}</div>
  </details>;
}

const count = (n: number, one: string, many: string) => n ? `${n} ${n === 1 ? one : many}` : "None yet";

/** The couple's names, parents' lines and the blessing line at the top. */
export function EssentialsFields({ site, update, partners, readOnly }: { site: InvitationSite; update: Update; partners: string[]; readOnly: boolean }) {
  const preset = (BLESSING_PRESETS as readonly string[]).includes(site.blessing_header) ? site.blessing_header : site.blessing_header ? "custom" : "";
  return <>
    <Group title="The couple" summary={site.parents.one || site.parents.two ? "Parents' lines added" : "Add each family's line"} open>
      <fieldset className="field-grid" disabled={readOnly}>
        <TextArea label={`Under ${partners[0] || "partner one"}'s name`} rows={2} maxLength={200} value={site.parents.one} onChange={(event) => update("parents", { ...site.parents, one: event.target.value })} placeholder="D/o Smt. Lakshmi & Sri Prakash Shetty, Udupi" hint="Edit the S/o, D/o wording freely, or leave blank." />
        <TextArea label={`Under ${partners[1] || "partner two"}'s name`} rows={2} maxLength={200} value={site.parents.two} onChange={(event) => update("parents", { ...site.parents, two: event.target.value })} placeholder="S/o Smt. Geetha & Sri Ramesh Rai, Mangaluru" />
      </fieldset>
      {partners.length < 2 && <p className="field-help">Your names come from Settings → Wedding details.</p>}
    </Group>
    <Group title="Blessing line" summary={site.blessing_header || "None"}>
      <fieldset className="field-grid" disabled={readOnly}>
        <Select label="Shown above the invitation" value={preset} onChange={(event) => update("blessing_header", event.target.value === "custom" ? site.blessing_header || "|| " : event.target.value)}>
          <option value="">None</option>
          {BLESSING_PRESETS.map((line) => <option key={line} value={line}>{line}</option>)}
          <option value="custom">Write my own…</option>
        </Select>
        {preset === "custom" && <TextInput label="Your blessing line" maxLength={80} value={site.blessing_header} onChange={(event) => update("blessing_header", event.target.value)} />}
      </fieldset>
    </Group>
  </>;
}

/** Story, guest information, FAQ, palettes, livestream, closing, social and wording fine-tuning. */
export function WebsiteContentFields({ data, site, update, readOnly, simple = false }: { data: Data; site: InvitationSite; update: Update; readOnly: boolean; simple?: boolean }) {
  // A Save the Date shows the date, story, photos and closing only; the rest belongs to the full invitation.
  const full = site.kind !== "save_the_date";
  // The simple studio edits only what the simple reply page shows.
  const extras = !simple;
  const setStory = (index: number, patch: Partial<StoryMoment>) => update("story", site.story.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setFaq = (index: number, patch: Partial<Faq>) => update("faqs", site.faqs.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setInfo = (index: number, patch: Partial<InfoCard>) => update("info_cards", site.info_cards.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setPalette = (functionId: string, value: string) => {
    const colors = value.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean).map((part) => part.startsWith("#") ? part : `#${part}`);
    const palettes = { ...site.palettes };
    if (colors.length) palettes[functionId] = colors; else delete palettes[functionId];
    update("palettes", palettes);
  };
  return <>
    {extras && <Group title="Our story" summary={count(site.story.length, "moment", "moments")}>
      <fieldset className="wording" disabled={readOnly}>
        {!site.story.length && <p className="field-help">For example how you met, the proposal, the engagement. Up to 8 moments.</p>}
        {site.story.map((moment, index) => <div key={index} className="site-row">
          <TextInput label="When" value={moment.when} maxLength={40} onChange={(event) => setStory(index, { when: event.target.value })} placeholder="2019, Mangaluru" />
          <TextInput label="Title" value={moment.title} maxLength={80} required onChange={(event) => setStory(index, { title: event.target.value })} />
          <TextArea label="A few lines" value={moment.text} maxLength={600} onChange={(event) => setStory(index, { text: event.target.value })} className="field-full" />
          <button type="button" className="button button-quiet" onClick={() => update("story", site.story.filter((_, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /> Remove</button>
        </div>)}
        {site.story.length < 8 && <button type="button" className="button button-secondary" onClick={() => update("story", [...site.story, { when: "", title: "", text: "" }])}><Plus size={14} aria-hidden="true" /> Add a moment</button>}
      </fieldset>
    </Group>}

    {full && <Group title="Guest information" summary={count(site.info_cards.length, "card", "cards")}>
      <fieldset className="wording" disabled={readOnly}>
        <p className="field-help">Where to stay, how to get there, or who guests can call. Up to 6 cards. Personal room and pickup details are shown to each guest separately.</p>
        {site.info_cards.map((card, index) => <div key={index} className="site-row">
          <TextInput label="Title" value={card.title} maxLength={60} required onChange={(event) => setInfo(index, { title: event.target.value })} placeholder="Getting to the venue" />
          <TextInput label="Phone (optional)" type="tel" value={card.phone} maxLength={30} onChange={(event) => setInfo(index, { phone: event.target.value })} placeholder="+91 98450 12345" />
          <TextArea label="Details" value={card.text} maxLength={500} onChange={(event) => setInfo(index, { text: event.target.value })} className="field-full" />
          <button type="button" className="button button-quiet" onClick={() => update("info_cards", site.info_cards.filter((_, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /> Remove</button>
        </div>)}
        {site.info_cards.length < 6 && <button type="button" className="button button-secondary" onClick={() => update("info_cards", [...site.info_cards, { title: "", text: "", phone: "" }])}><Plus size={14} aria-hidden="true" /> Add a card</button>}
      </fieldset>
    </Group>}

    {full && extras && <Group title="Good to know (FAQ)" summary={count(site.faqs.length, "question", "questions")}>
      <fieldset className="wording" disabled={readOnly}>
        {!site.faqs.length && <p className="field-help">For example parking, the muhurtham time, rituals explained for friends, what to wear. Up to 12.</p>}
        {site.faqs.map((faq, index) => <div key={index} className="site-row">
          <TextInput label="Question" value={faq.question} maxLength={160} required onChange={(event) => setFaq(index, { question: event.target.value })} className="field-full" />
          <TextArea label="Answer" value={faq.answer} maxLength={800} required onChange={(event) => setFaq(index, { answer: event.target.value })} className="field-full" />
          <button type="button" className="button button-quiet" onClick={() => update("faqs", site.faqs.filter((_, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /> Remove</button>
        </div>)}
        {site.faqs.length < 12 && <button type="button" className="button button-secondary" onClick={() => update("faqs", [...site.faqs, { question: "", answer: "" }])}><Plus size={14} aria-hidden="true" /> Add a question</button>}
      </fieldset>
    </Group>}

    {full && extras && data.functions.length > 0 && <Group title="Colour palette per function" summary={count(Object.keys(site.palettes).length, "palette", "palettes")}>
      <fieldset className="wording" disabled={readOnly}>
        <p className="field-help">Up to 5 colours as hex codes, separated by spaces, e.g. <code>#E9B44C #7D1747</code>. Guests see them as swatches next to the dress code.</p>
        {data.functions.map((fn) => <div key={fn.id} className="site-palette-row">
          <TextInput label={fn.name} defaultValue={(site.palettes[fn.id] ?? []).join(" ")} onBlur={(event) => setPalette(fn.id, event.target.value)} />
          <span className="portal-palette" aria-hidden="true">{(site.palettes[fn.id] ?? []).filter((color) => /^#[0-9a-fA-F]{6}$/.test(color)).map((color) => <span key={color} className="portal-swatch" style={{ background: color }} />)}</span>
        </div>)}
      </fieldset>
    </Group>}

    <Group title="Invitation website elsewhere" summary={site.external_link.url ? "Linked" : "None"}>
      <fieldset className="field-grid" disabled={readOnly}>
        <TextInput label="Link (optional)" type="url" value={site.external_link.url ?? ""} onChange={(event) => update("external_link", { ...site.external_link, url: event.target.value || null })} placeholder="https://" hint="If you made an invitation website with another service, guests see a button to open it. Replies stay here, so you keep one guest list." className="field-full" />
        <TextInput label="Button text" maxLength={60} value={site.external_link.label} onChange={(event) => update("external_link", { ...site.external_link, label: event.target.value })} placeholder="See our full invitation" />
      </fieldset>
    </Group>

    {full && extras && <Group title="Livestream" summary={site.livestream_url ? "Link added" : "None"}>
      <TextInput label="Livestream link (optional)" type="url" value={site.livestream_url ?? ""} onChange={(event) => update("livestream_url", event.target.value || null)} placeholder="https://" hint="Shown as “Watch live” from 30 minutes before a function until 6 hours after it starts." disabled={readOnly} />
    </Group>}

    {extras && <Group title="Closing and family" summary={site.closing.names.length ? count(site.closing.names.length, "name", "names") : "Off"}>
      <fieldset className="field-grid" disabled={readOnly}>
        <TextInput label="Heading" maxLength={80} value={site.closing.title} onChange={(event) => update("closing", { ...site.closing, title: event.target.value })} placeholder="With best compliments from" hint="Blank uses the built-in heading in each guest's language." />
        <TextArea label="Family names, one per line" rows={4} value={site.closing.names.join("\n")} onChange={(event) => update("closing", { ...site.closing, names: event.target.value.split("\n").map((name) => name.trimStart()).slice(0, 16) })} placeholder={"Shetty family, Udupi\nRai family, Mangaluru"} hint="Up to 16 lines." />
      </fieldset>
    </Group>}

    {extras && <Group title="Hashtag and Instagram" summary={[site.hashtag, ...site.instagram.map((handle) => `@${handle}`)].filter(Boolean).join(" · ") || "None"}>
      <fieldset className="field-grid" disabled={readOnly}>
        <TextInput label="Wedding hashtag" maxLength={40} value={site.hashtag} onChange={(event) => update("hashtag", event.target.value.replace(/\s+/g, ""))} placeholder="#RaviWedsMeera" />
        <HandlesInput value={site.instagram} onChange={(handles) => update("instagram", handles)} />
      </fieldset>
    </Group>}

    {extras && <Group title="Opening screen and section titles" summary="Fine-tune the wording">
      <fieldset className="field-grid" disabled={readOnly}>
        <p className="field-help field-full">Leave any line blank to use the built-in wording in each guest’s language. What you write here is shown as written, in every language.</p>
        <TextInput label="Opening screen heading" maxLength={80} value={site.reveal.title} onChange={(event) => update("reveal", { ...site.reveal, title: event.target.value })} placeholder="You are cordially invited" />
        <TextInput label="Opening button" maxLength={80} value={site.reveal.hint} onChange={(event) => update("reveal", { ...site.reveal, hint: event.target.value })} placeholder="Open your invitation" />
        <TextInput label="“Our story” heading" maxLength={60} value={site.titles.story} onChange={(event) => update("titles", { ...site.titles, story: event.target.value })} placeholder="Our story" />
        <TextInput label="“Guest information” heading" maxLength={60} value={site.titles.info} onChange={(event) => update("titles", { ...site.titles, info: event.target.value })} placeholder="Guest information" />
        <TextInput label="“Good to know” heading" maxLength={60} value={site.titles.faq} onChange={(event) => update("titles", { ...site.titles, faq: event.target.value })} placeholder="Good to know" />
        <TextInput label="“Blessings” heading" maxLength={60} value={site.titles.blessings} onChange={(event) => update("titles", { ...site.titles, blessings: event.target.value })} placeholder="Blessings" />
      </fieldset>
    </Group>}
  </>;
}

/** Keeps what is typed (spaces included) and passes the parsed handles up. */
function HandlesInput({ value, onChange }: { value: string[]; onChange: (handles: string[]) => void }) {
  const [raw, setRaw] = useState(value.map((handle) => `@${handle}`).join(" "));
  return <TextInput label="Instagram handles (up to 3, separated by spaces)" value={raw} placeholder="@ravi @meera"
    onChange={(event) => { setRaw(event.target.value); onChange(event.target.value.split(/[\s,]+/).map((handle) => handle.replace(/^@/, "")).filter(Boolean).slice(0, 3)); }} />;
}

/** Guests' blessings waiting for approval; only approved ones are shown, with the writer's first name. */
export function BlessingsModeration({ data }: { data: Data }) {
  const guestName = new Map(data.guests.map((guest) => [guest.id, guest.full_name]));
  const pending = data.blessings.filter((blessing) => blessing.status === "pending");
  const others = data.blessings.filter((blessing) => blessing.status !== "pending");
  return <Card title="Blessings to review" subtitle="Guests only see blessings you approve, with the writer's first name.">
    {!data.blessings.length ? <EmptyState title="No blessings yet" description="Messages guests leave on their invitation page appear here." /> : <>
      {pending.length > 0 && <ul className="doc-list">{pending.map((blessing) => <li key={blessing.id} className="travel-guest">
        <p>“{blessing.message}”</p>
        <p className="row-meta">{guestName.get(blessing.guest_id) ?? "Guest"} · {formatDateTime(blessing.created_at, data.wedding.timezone)}</p>
        {data.canEdit && <div className="doc-actions">
          <ActionForm action={moderateBlessingAction} submitLabel="Approve" variant="primary" className="inline-action-form"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="blessingId" value={blessing.id} /><input type="hidden" name="status" value="approved" /></ActionForm>
          <ActionForm action={moderateBlessingAction} submitLabel="Hide" variant="quiet" className="inline-action-form"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="blessingId" value={blessing.id} /><input type="hidden" name="status" value="hidden" /></ActionForm>
        </div>}
      </li>)}</ul>}
      {others.length > 0 && <details className="travel-edit"><summary>Approved and hidden ({others.length})</summary>
        <ul className="doc-list">{others.map((blessing) => <li key={blessing.id} className={`travel-guest ${blessing.status === "hidden" ? "is-muted" : ""}`}>
          <p>“{blessing.message}”</p><p className="row-meta">{guestName.get(blessing.guest_id) ?? "Guest"} · {blessing.status === "approved" ? "Shown to guests" : "Hidden"}</p>
          {data.canEdit && <ActionForm action={moderateBlessingAction} submitLabel={blessing.status === "approved" ? "Hide" : "Approve"} variant="quiet" className="inline-action-form"><input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="blessingId" value={blessing.id} /><input type="hidden" name="status" value={blessing.status === "approved" ? "hidden" : "approved"} /></ActionForm>}
        </li>)}</ul>
      </details>}
    </>}
  </Card>;
}
