"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Checkbox, TextArea, TextInput } from "@/components/form-fields";
import { Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { readSite, type Faq, type InvitationSite, type StoryMoment } from "@/lib/invitations/site";
import type { InvitationWorkspace } from "@/lib/data/invitations";
import { moderateBlessingAction, saveSiteAction } from "@/app/actions/invitations";

type Data = InvitationWorkspace;
type Design = Data["designs"][number];

/** Edits the invitation website that guests see on their private link, and moderates blessings. */
export function InvitationWebsiteEditor({ data, design }: { data: Data; design: Design }) {
  const [site, setSite] = useState<InvitationSite>(() => readSite(design.site));
  const update = <K extends keyof InvitationSite>(key: K, value: InvitationSite[K]) => setSite((current) => ({ ...current, [key]: value }));
  const setStory = (index: number, patch: Partial<StoryMoment>) => update("story", site.story.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setFaq = (index: number, patch: Partial<Faq>) => update("faqs", site.faqs.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setPalette = (functionId: string, value: string) => {
    const colors = value.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean).map((part) => part.startsWith("#") ? part : `#${part}`);
    const palettes = { ...site.palettes };
    if (colors.length) palettes[functionId] = colors; else delete palettes[functionId];
    update("palettes", palettes);
  };
  const readOnly = !data.canEdit;
  const guestName = new Map(data.guests.map((guest) => [guest.id, guest.full_name]));
  const pending = data.blessings.filter((blessing) => blessing.status === "pending");
  const others = data.blessings.filter((blessing) => blessing.status !== "pending");
  return <>
    <Card title={`Website for “${design.name}”`} subtitle="Everything here appears on each guest's private invitation page. Changes show the next time they open their link.">
      <ActionForm action={saveSiteAction} submitLabel="Save website" variant="primary" className="section-stack">
        <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="designId" value={design.id} /><input type="hidden" name="version" value={design.version} />
        <input type="hidden" name="site" value={JSON.stringify(site)} />
        <fieldset className="check-list" disabled={readOnly}>
          <legend className="field-label">Features</legend>
          <Checkbox label="Opening animation (an envelope guests tap to open; skipped for people who prefer less motion)" checked={site.opening_animation} onChange={(event) => update("opening_animation", event.target.checked)} />
          <Checkbox label="Countdown to the next function" checked={site.countdown} onChange={(event) => update("countdown", event.target.checked)} />
          <Checkbox label="Blessings wall (guests leave wishes; you approve each one before others see it)" checked={site.blessings_enabled} onChange={(event) => update("blessings_enabled", event.target.checked)} />
        </fieldset>
        <TextInput label="Livestream link (optional)" type="url" value={site.livestream_url ?? ""} onChange={(event) => update("livestream_url", event.target.value || null)} placeholder="https://" hint="Shown as “Watch live” from 30 minutes before a function until 6 hours after it starts." disabled={readOnly} />

        <fieldset className="wording" disabled={readOnly}>
          <legend className="field-label">Our story (up to 8 moments)</legend>
          {!site.story.length && <p className="field-help">For example how you met, the proposal, the engagement.</p>}
          {site.story.map((moment, index) => <div key={index} className="site-row">
            <TextInput label="When" value={moment.when} maxLength={40} onChange={(event) => setStory(index, { when: event.target.value })} placeholder="2019, Mangaluru" />
            <TextInput label="Title" value={moment.title} maxLength={80} required onChange={(event) => setStory(index, { title: event.target.value })} />
            <TextArea label="A few lines" value={moment.text} maxLength={600} onChange={(event) => setStory(index, { text: event.target.value })} className="field-full" />
            <button type="button" className="button button-quiet" onClick={() => update("story", site.story.filter((_, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /> Remove</button>
          </div>)}
          {site.story.length < 8 && <button type="button" className="button button-secondary" onClick={() => update("story", [...site.story, { when: "", title: "", text: "" }])}><Plus size={14} aria-hidden="true" /> Add a moment</button>}
        </fieldset>

        <fieldset className="wording" disabled={readOnly}>
          <legend className="field-label">Good to know (FAQ, up to 12)</legend>
          {!site.faqs.length && <p className="field-help">For example parking, the muhurtham time, rituals explained for friends, what to wear.</p>}
          {site.faqs.map((faq, index) => <div key={index} className="site-row">
            <TextInput label="Question" value={faq.question} maxLength={160} required onChange={(event) => setFaq(index, { question: event.target.value })} className="field-full" />
            <TextArea label="Answer" value={faq.answer} maxLength={800} required onChange={(event) => setFaq(index, { answer: event.target.value })} className="field-full" />
            <button type="button" className="button button-quiet" onClick={() => update("faqs", site.faqs.filter((_, i) => i !== index))}><Trash2 size={14} aria-hidden="true" /> Remove</button>
          </div>)}
          {site.faqs.length < 12 && <button type="button" className="button button-secondary" onClick={() => update("faqs", [...site.faqs, { question: "", answer: "" }])}><Plus size={14} aria-hidden="true" /> Add a question</button>}
        </fieldset>

        {data.functions.length > 0 && <fieldset className="wording" disabled={readOnly}>
          <legend className="field-label">Colour palette per function (optional)</legend>
          <p className="field-help">Up to 5 colours as hex codes, separated by spaces, e.g. <code>#E9B44C #7D1747</code>. Guests see them as swatches next to the dress code.</p>
          {data.functions.map((fn) => <div key={fn.id} className="site-palette-row">
            <TextInput label={fn.name} defaultValue={(site.palettes[fn.id] ?? []).join(" ")} onBlur={(event) => setPalette(fn.id, event.target.value)} />
            <span className="portal-palette" aria-hidden="true">{(site.palettes[fn.id] ?? []).filter((color) => /^#[0-9a-fA-F]{6}$/.test(color)).map((color) => <span key={color} className="portal-swatch" style={{ background: color }} />)}</span>
          </div>)}
        </fieldset>}
      </ActionForm>
    </Card>

    {site.blessings_enabled && <Card title="Blessings to review" subtitle="Guests only see blessings you approve, with the writer's first name.">
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
    </Card>}
  </>;
}
