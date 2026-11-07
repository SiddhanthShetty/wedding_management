"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import { Copy, Download, Mail, MessageCircle, Palette, Send, Share2, Image as ImageIcon, Clapperboard, FileText, Sparkles, RotateCcw, Smartphone, Link2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { CARD_FORMATS, FormattedCard, InvitationCard, type CardFormat } from "@/components/invitation-card";
import { qrPath } from "@/lib/invitations/qr";
import { recordInvitationVideo } from "@/lib/invitations/video";
import { resizePhoto } from "@/lib/invitations/photo";
import { PORTAL_STRINGS } from "@/lib/guest-portal/i18n";
import { Checkbox, Select, TextArea, TextInput } from "@/components/form-fields";
import { TabList } from "@/components/tab-list";
import { BlessingsModeration, EssentialsFields, WebsiteContentFields } from "@/components/invitation-website-editor";
import { PortalPreview } from "@/components/guest-portal";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { buildCardProps } from "@/lib/invitations/card-data";
import { buildPreviewData, previewFunction } from "@/lib/invitations/preview";
import { EFFECTS, OPENING_STYLES, readSite, TEMPLATES, type InvitationSite } from "@/lib/invitations/site";
import { GalleryEditor, MusicUploader, studioMedia } from "@/components/invitation-media-editor";
import { DEFAULT_TEXTS, LANGUAGES, isLanguage, mailtoUrl, resolveTexts, shareMessage, TEXT_KEYS, TEXT_LABELS, THEMES, themeById, whatsappUrl, type LanguageCode, type TextOverrides, type ThemeId } from "@/lib/invitations/content";
import { cardFileName, svgElementToPng } from "@/lib/invitations/export-card";
import type { InvitationWorkspace } from "@/lib/data/invitations";
import { createMissingLinksAction } from "@/app/actions/bulk";
import { createPreviewLinkAction, prepareInvitationAction, recordInvitationSharedAction, saveDesignAction, saveDesignPhotoAction, setDefaultDesignAction } from "@/app/actions/invitations";

type Data = InvitationWorkspace;
type Design = Data["designs"][number];
type Household = Data["households"][number];
type Guest = Data["guests"][number];
type Step = "design" | "content" | "extras" | "share";

/** Everything the couple edits in the studio before saving: the card and the invitation website. */
type Draft = { name: string; theme: ThemeId; useAccent: boolean; accent: string; texts: TextOverrides; showMonogram: boolean; site: InvitationSite };

function draftFrom(design: Design | undefined): Draft {
  return {
    name: design?.name ?? "Our invitation", theme: design?.theme ?? "mallige", useAccent: Boolean(design?.accent),
    accent: design?.accent ?? themeById(design?.theme ?? "mallige").accent, texts: design?.texts ?? {},
    showMonogram: design?.show_monogram ?? true, site: readSite(design?.site),
  };
}

/** Drops blank wording and empty list rows, so comparing and saving ignore untouched fields. */
function cleanDraft(draft: Draft): Draft {
  const texts = Object.fromEntries(Object.entries(draft.texts).map(([lang, lines]) => [lang, Object.fromEntries(Object.entries(lines ?? {}).filter(([, value]) => value?.trim()))]).filter(([, lines]) => Object.keys(lines as object).length)) as TextOverrides;
  const site = { ...draft.site, closing: { ...draft.site.closing, names: draft.site.closing.names.map((name) => name.trim()).filter(Boolean) } };
  return { ...draft, accent: draft.useAccent ? draft.accent : "", texts, site };
}
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(cleanDraft(a)) === JSON.stringify(cleanDraft(b));

export function InvitationStudio({ data }: { data: Data }) {
  const defaultDesign = data.designs.find((design) => design.is_default) ?? data.designs[0];
  const [designId, setDesignId] = useState(defaultDesign?.id ?? "new");
  const [step, setStep] = useState<Step>(data.designs.length ? "share" : "design");
  // After "Create design", switch the studio to the new design so the next save updates it.
  const designCount = useRef(data.designs.length);
  useEffect(() => {
    if (data.designs.length > designCount.current && designId === "new") setDesignId(data.designs[data.designs.length - 1]!.id);
    designCount.current = data.designs.length;
  }, [data.designs, designId]);
  const design = data.designs.find((row) => row.id === designId);
  const invitedGuests = useMemo(() => data.guests.filter((guest) => data.invitations.some((invitation) => invitation.guest_id === guest.id)), [data]);
  return <div className="section-stack invitations-page">
    <PageHeading eyebrow="Guests" title="Invitations" description="Design your invitation in four steps and watch the guest page change as you go. Nothing is sent automatically." />
    <StudioWorkspace key={designId} data={data} design={design} designId={designId} setDesignId={setDesignId} step={step} setStep={setStep} guests={invitedGuests} defaultDesign={defaultDesign} />
  </div>;
}

function StudioWorkspace({ data, design, designId, setDesignId, step, setStep, guests, defaultDesign }: {
  data: Data; design?: Design; designId: string; setDesignId: (id: string) => void; step: Step; setStep: (step: Step) => void; guests: Guest[]; defaultDesign?: Design;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(design));
  const [lang, setLang] = useState<LanguageCode>("en");
  const [photo, setPhoto] = useState<string | null>(design?.photo_data ?? null);
  useEffect(() => setPhoto(design?.photo_data ?? null), [design?.photo_data]);
  const dirty = !sameDraft(draft, draftFrom(design));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateSite = <K extends keyof InvitationSite>(key: K, value: InvitationSite[K]) => setDraft((current) => ({ ...current, site: { ...current.site, [key]: value } }));
  const readOnly = !data.canEdit;
  const steps = [
    { id: "design" as Step, label: "1 · Design", icon: Palette }, { id: "content" as Step, label: "2 · Content", icon: FileText },
    { id: "extras" as Step, label: "3 · Extras", icon: Sparkles }, { id: "share" as Step, label: "4 · Share", icon: Send },
  ];
  // Leaving with unsaved changes asks first (the browser shows its own wording).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return <div className="studio">
    <div className="studio-main section-stack">
      {(data.designs.length > 0 || data.canEdit) && <Card>
        <div className="field-grid">
          <Select label="Design" value={designId} onChange={(event) => { if (!dirty || window.confirm("Discard unsaved changes to this design?")) setDesignId(event.target.value); }}>
            {data.designs.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_default ? " (guests see this)" : ""}</option>)}
            {data.canEdit && <option value="new">+ New design</option>}
          </Select>
          {design && !design.is_default && data.canEdit && <ActionForm action={setDefaultDesignAction} submitLabel="Show this design to guests" className="inline-action-form">
            <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="designId" value={design.id} />
          </ActionForm>}
        </div>
        {readOnly && <p className="readonly-note">You can preview designs. Guest-list edit access is needed to change them.</p>}
      </Card>}
      <TabList tabs={steps} selected={step} onSelect={setStep} label="Invitation steps" idPrefix="invite" />
      <section role="tabpanel" id={`invite-panel-${step}`} aria-labelledby={`invite-tab-${step}`} tabIndex={0} className="section-stack">
        {step === "design" && <DesignStep data={data} design={design} draft={draft} set={set} updateSite={updateSite} onPhoto={setPhoto} readOnly={readOnly} />}
        {step === "content" && <ContentStep data={data} designId={designId} draft={draft} set={set} updateSite={updateSite} lang={lang} setLang={setLang} readOnly={readOnly} />}
        {step === "extras" && <ExtrasStep data={data} draft={draft} photo={photo} lang={lang} />}
        {step === "share" && <ShareStep data={data} design={design} defaultDesign={defaultDesign} guests={guests} dirty={dirty} />}
      </section>
      {step !== "share" && data.canEdit && <SaveBar data={data} design={design} draft={draft} dirty={dirty} />}
    </div>
    <aside className="studio-preview" aria-label="Live preview">
      <PhonePreview data={data} draft={draft} photo={photo} lang={lang} setLang={setLang} guests={guests} designId={design?.id} />
    </aside>
    <a className="studio-preview-jump button button-secondary" href="#studio-phone"><Smartphone size={15} aria-hidden="true" /> Preview</a>
  </div>;
}

/** One save for the card and the website, so both always match what the preview shows. */
function SaveBar({ data, design, draft, dirty }: { data: Data; design?: Design; draft: Draft; dirty: boolean }) {
  const clean = cleanDraft(draft);
  return <div className={`studio-savebar ${dirty ? "is-dirty" : ""}`}>
    <p className="studio-save-state" role="status">{!design ? "Not created yet" : dirty ? "Unsaved changes" : "All changes saved"}</p>
    <ActionForm action={saveDesignAction} submitLabel={design ? "Save changes" : "Create design"} variant="primary" className="inline-action-form">
      <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="designId" value={design?.id ?? ""} /><input type="hidden" name="version" value={design?.version ?? ""} />
      <input type="hidden" name="name" value={clean.name} /><input type="hidden" name="theme" value={clean.theme} />
      <input type="hidden" name="useAccent" value={clean.useAccent ? "on" : ""} /><input type="hidden" name="accent" value={clean.accent} />
      <input type="hidden" name="showMonogram" value={clean.showMonogram ? "on" : ""} />
      <input type="hidden" name="texts" value={JSON.stringify(clean.texts)} /><input type="hidden" name="site" value={JSON.stringify(clean.site)} />
    </ActionForm>
  </div>;
}

function DesignStep({ data, design, draft, set, updateSite, onPhoto, readOnly }: {
  data: Data; design?: Design; draft: Draft; set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  updateSite: <K extends keyof InvitationSite>(key: K, value: InvitationSite[K]) => void; onPhoto: (photo: string | null) => void; readOnly: boolean;
}) {
  return <>
    <Card title="Page template" subtitle="How the guest page is laid out. Every template works with every theme and language.">
      <fieldset className="choice-cards" disabled={readOnly}>
        <legend className="sr-only">Page template</legend>
        {TEMPLATES.map((option) => <label key={option.id} className={`choice-card ${draft.site.template === option.id ? "is-selected" : ""}`}>
          <input type="radio" name="template-choice" value={option.id} checked={draft.site.template === option.id} onChange={() => updateSite("template", option.id)} />
          <span className={`choice-thumb is-${option.id}`} aria-hidden="true" />
          <strong>{option.name}</strong><span className="row-meta">{option.description}</span>
        </label>)}
      </fieldset>
    </Card>
    <Card title="Theme and colours" subtitle="Each theme sets the card, the guest page and your workspace colours.">
      <TextInput label="Design name" required maxLength={80} value={draft.name} onChange={(event) => set("name", event.target.value)} disabled={readOnly} hint="Only you see this name." />
      <fieldset className="theme-picker" disabled={readOnly}>
        <legend className="field-label">Theme</legend>
        {THEMES.map((option) => <label key={option.id} className={`theme-option ${draft.theme === option.id ? "is-selected" : ""}`}>
          <input type="radio" name="theme-choice" value={option.id} checked={draft.theme === option.id} onChange={() => { set("theme", option.id); if (!draft.useAccent) set("accent", option.accent); }} />
          <span className="theme-swatch" style={{ background: option.background, borderColor: option.accent }} aria-hidden="true"><span style={{ background: option.accent }} /></span>
          <span><strong>{option.name}</strong><span className="row-meta">{option.description}</span></span>
        </label>)}
      </fieldset>
      <div className="field-grid">
        <div className="field">
          <Checkbox label="Use my own accent colour" checked={draft.useAccent} onChange={(event) => set("useAccent", event.target.checked)} disabled={readOnly} />
          {draft.useAccent && <TextInput label="Accent colour" type="color" value={draft.accent} onChange={(event) => set("accent", event.target.value)} hint="Text keeps the theme colour if yours is too light to read." />}
        </div>
      </div>
    </Card>
    <Card title="Photo and monogram">
      {design ? <PhotoUploader data={data} design={design} onPreview={onPhoto} /> : <p className="field-help">Create the design first, then add a couple photo.</p>}
      <Checkbox label="Show our monogram (initials) on the card when there is no photo, and on the opening seal" checked={draft.showMonogram} onChange={(event) => set("showMonogram", event.target.checked)} disabled={readOnly} />
    </Card>
    <Card title="How guests open it">
      <fieldset className="check-list" disabled={readOnly}>
        <Checkbox label="Opening animation that guests tap to open (skipped for people who prefer less motion)" checked={draft.site.opening_animation} onChange={(event) => updateSite("opening_animation", event.target.checked)} />
      </fieldset>
      {draft.site.opening_animation && <fieldset className="choice-cards" disabled={readOnly}>
        <legend className="field-label">Opening</legend>
        {OPENING_STYLES.map((option) => <label key={option.id} className={`choice-card ${draft.site.opening_style === option.id ? "is-selected" : ""}`}>
          <input type="radio" name="opening-choice" value={option.id} checked={draft.site.opening_style === option.id} onChange={() => updateSite("opening_style", option.id)} />
          <strong>{option.name}</strong><span className="row-meta">{option.description}</span>
        </label>)}
      </fieldset>}
      <Select label="Celebration effect" value={draft.site.effect} onChange={(event) => updateSite("effect", event.target.value as InvitationSite["effect"])} disabled={readOnly} hint="Plays after the opening and when a guest replies yes. Skipped for people who prefer less motion.">
        {EFFECTS.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </Select>
      <fieldset className="check-list" disabled={readOnly}>
        <Checkbox label="Countdown to the next function" checked={draft.site.countdown} onChange={(event) => updateSite("countdown", event.target.checked)} />
        <Checkbox label="Blessings wall (guests leave wishes; you approve each one before others see it)" checked={draft.site.blessings_enabled} onChange={(event) => updateSite("blessings_enabled", event.target.checked)} />
      </fieldset>
      <p className="field-help">Use “Replay opening” above the phone preview to see the opening again.</p>
    </Card>
    <Card title="Music" subtitle="Saved straight away; it does not wait for “Save changes”.">
      <MusicUploader data={data} design={design} />
    </Card>
  </>;
}

function ContentStep({ data, designId, draft, set, updateSite, lang, setLang, readOnly }: {
  data: Data; designId: string; draft: Draft; set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  updateSite: <K extends keyof InvitationSite>(key: K, value: InvitationSite[K]) => void; lang: LanguageCode; setLang: (lang: LanguageCode) => void; readOnly: boolean;
}) {
  const languageInfo = LANGUAGES.find((item) => item.code === lang)!;
  const setText = (key: typeof TEXT_KEYS[number], value: string) => set("texts", { ...draft.texts, [lang]: { ...draft.texts[lang], [key]: value } });
  const edited = Object.values(draft.texts[lang] ?? {}).filter((value) => value?.trim()).length;
  return <Card title="Invitation details" subtitle="Open a section to edit it. The preview updates as you type.">
    <div className="studio-groups">
      <EssentialsFields site={draft.site} update={updateSite} partners={data.couplePartners} readOnly={readOnly} />
      <details className="studio-group">
        <summary><span className="studio-group-title">Card wording</span><span className="studio-group-summary">{languageInfo.label}{edited ? ` · ${edited} line${edited === 1 ? "" : "s"} edited` : " · built-in wording"}</span></summary>
        <fieldset className="studio-group-body wording" disabled={readOnly}>
          <Select label="Language" value={lang} onChange={(event) => setLang(event.target.value as LanguageCode)} hint="The preview switches to this language too.">{LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</Select>
          {languageInfo.draft && <p className="travel-warning">The built-in {languageInfo.label} wording is a draft. Please have a native speaker check it{lang === "tcy" ? ", especially Tulu" : ""}. Edit any line below.</p>}
          <p className="field-help">Use {"{{name}}"} for the invited person, {"{{couple}}"} for your names and {"{{link}}"} for that person's private link. Leave a line blank to use the default shown.</p>
          {TEXT_KEYS.map((key) => <TextArea key={`${lang}-${key}`} label={TEXT_LABELS[key]} rows={key === "share" || key === "body" ? 3 : 1} maxLength={600} lang={lang}
            value={draft.texts[lang]?.[key] ?? ""} placeholder={DEFAULT_TEXTS[lang][key]} onChange={(event) => setText(key, event.target.value)} />)}
        </fieldset>
      </details>
      <details className="studio-group">
        <summary><span className="studio-group-title">Photo gallery</span><span className="studio-group-summary">{(() => { const n = data.media.filter((row) => row.design_id === designId && row.kind === "gallery").length; return n ? `${n} photo${n === 1 ? "" : "s"} · saved straight away` : "None yet"; })()}</span></summary>
        <div className="studio-group-body"><GalleryEditor data={data} design={data.designs.find((row) => row.id === designId)} /></div>
      </details>
      <WebsiteContentFields data={data} site={draft.site} update={updateSite} readOnly={readOnly} />
    </div>
  </Card>;
}

/** A sample card in every format, to check before making each guest's own. */
function ExtrasStep({ data, draft, photo, lang }: { data: Data; draft: Draft; photo: string | null; lang: LanguageCode }) {
  const [format, setFormat] = useState<CardFormat>("print");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const card = buildCardProps({ theme: draft.theme, accent: draft.useAccent ? draft.accent : null, overrides: draft.texts, language: lang, couple: data.coupleNames, greetingName: PORTAL_STRINGS[lang].previewGuest, functions: data.functions.slice(0, 4), photoUrl: photo, showMonogram: draft.showMonogram });
  const download = async () => {
    setError("");
    try {
      const svg = ref.current?.querySelector("svg"); if (!svg) throw new Error("The card is not ready.");
      const url = URL.createObjectURL(await svgElementToPng(svg)); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `invitation-sample-${format}.png`; anchor.click(); URL.revokeObjectURL(url);
    } catch (problem) { setError((problem as Error).message); }
  };
  return <>
    <Card title="Card formats" subtitle="Check how the card looks as a phone image, a status story, a square post or a printable A5 card. Each guest's own card, with their name and QR code, is made in Share.">
      <Select label="Format" value={format} onChange={(event) => setFormat(event.target.value as CardFormat)} hint={CARD_FORMATS[format].hint}>
        {(Object.keys(CARD_FORMATS) as CardFormat[]).map((value) => <option key={value} value={value}>{CARD_FORMATS[value].label}</option>)}
      </Select>
      <div className="invite-preview" ref={ref}><FormattedCard format={format} card={card} qr={format === "print" ? qrPath("https://example.invalid/guest#sample-qr-code") : null} qrLabel={PORTAL_STRINGS[lang].openInvitation} /></div>
      {format === "print" && <p className="field-help">This sample QR code does not open anything. Each guest's card gets a QR code for their own private link.</p>}
      <div className="doc-actions"><button type="button" className="button button-secondary" onClick={download}><Download size={15} aria-hidden="true" /> Download sample</button></div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </Card>
    <Card title="Video invitation">
      <p className="field-help"><Clapperboard size={15} aria-hidden="true" /> An 8-second video with falling petals, made on this device for each guest. Open a guest in Share, create their link, then choose “Make a video invitation”.</p>
    </Card>
  </>;
}

function ShareStep({ data, design, defaultDesign, guests, dirty }: { data: Data; design?: Design; defaultDesign?: Design; guests: Guest[]; dirty: boolean }) {
  if (!defaultDesign) return <Card><EmptyState title="Create a design first" description="Choose a theme in Design, then save. Then come back here to share it." /></Card>;
  const showBlessings = readSite(defaultDesign.site).blessings_enabled || data.blessings.length > 0;
  return <>
    {design && data.canEdit && <FamilyPreviewLink data={data} design={design} dirty={dirty} />}
    {design && !design.is_default && <p className="travel-warning">Guests see “{defaultDesign.name}”. Sharing below uses that design. Choose “Show this design to guests” to switch.</p>}
    <SendPanel data={data} design={defaultDesign} guests={guests} />
    {showBlessings && <BlessingsModeration data={data} />}
  </>;
}

/** A 30-minute link for family to see the saved design before invitations go out. Replies are off. */
function FamilyPreviewLink({ data, design, dirty }: { data: Data; design: Design; dirty: boolean }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState<{ error?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true); setStatus({});
    const result = await createPreviewLinkAction(data.wedding.id, design.id);
    setBusy(false);
    if (!result.token) { setStatus({ error: result.error ?? "Could not create the preview link." }); return; }
    setLink({ url: `${window.location.origin}/guest/preview#${result.token}`, expiresAt: result.expiresAt! });
  };
  const message = link ? `Please take a look at our wedding invitation before we send it: ${link.url}\n(This preview link works for 30 minutes.)` : "";
  return <Card title="Get a second opinion" subtitle="Share a preview with family before you send. It works for 30 minutes, is marked as a preview, and replies are switched off. It shows your saved design with a sample guest, never your guest list.">
    {dirty && <p className="travel-warning">You have unsaved changes. The preview link shows the last saved version.</p>}
    {!link ? <button type="button" className="button button-secondary" disabled={busy} onClick={create}><Link2 size={15} aria-hidden="true" /> {busy ? "Creating…" : "Create preview link"}</button> : <>
      <p className="field-success" role="status">Preview link ready until {formatDateTime(link.expiresAt, data.wedding.timezone)}. It is shown only now.</p>
      <TextInput label="Preview link" readOnly value={link.url} onFocus={(event) => event.target.select()} />
      <div className="doc-actions">
        <a className="button button-secondary" href={whatsappUrl("", message).url} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" /> WhatsApp</a>
        <button type="button" className="button button-secondary" onClick={() => navigator.clipboard?.writeText(link.url).then(() => setStatus({ message: "Link copied." }), () => setStatus({ error: "Copy failed; select the link instead." }))}><Copy size={15} aria-hidden="true" /> Copy</button>
        <a className="button button-quiet" href={link.url} target="_blank" rel="noopener noreferrer">Open</a>
        <button type="button" className="button button-quiet" onClick={() => setLink(null)}>Done</button>
      </div>
    </>}
    {status.error && <p className="field-error" role="alert">{status.error}</p>}
    {!status.error && status.message && <p className="field-success" role="status">{status.message}</p>}
  </Card>;
}

/** The guest page as a phone shows it, built from the unsaved draft, plus how the message looks in WhatsApp. */
function PhonePreview({ data, draft, photo, lang, setLang, guests, designId }: { data: Data; draft: Draft; photo: string | null; lang: LanguageCode; setLang: (lang: LanguageCode) => void; guests: Guest[]; designId?: string }) {
  const [mode, setMode] = useState<"invite" | "whatsapp">("invite");
  const [replay, setReplay] = useState(0);
  const [guestId, setGuestId] = useState("");
  const guest = guests.find((row) => row.id === guestId);
  const fnRows = guest ? guestFunctions(data, guest) : data.functions;
  const guestName = guest?.full_name ?? PORTAL_STRINGS[lang].previewGuest;
  const accent = draft.useAccent ? draft.accent : null;
  const media = studioMedia(data, designId);
  const portal = useMemo(() => ({ ...buildPreviewData({
    coupleNames: data.couplePartners.length ? data.couplePartners : [data.coupleNames], guestName, language: lang,
    functions: fnRows.map((fn) => previewFunction(fn, data.wedding.timezone)),
    design: { theme: draft.theme, accent, texts: draft.texts, show_monogram: draft.showMonogram, photo_url: photo, site: draft.site },
  }), media }), [data, guestName, lang, fnRows, draft, accent, photo, media]);
  return <div className="phone-preview" id="studio-phone">
    <div className="phone-toolbar">
      <div className="segmented" role="group" aria-label="Preview">
        <button type="button" className={mode === "invite" ? "is-active" : ""} aria-pressed={mode === "invite"} onClick={() => setMode("invite")}>Invite</button>
        <button type="button" className={mode === "whatsapp" ? "is-active" : ""} aria-pressed={mode === "whatsapp"} onClick={() => setMode("whatsapp")}>WhatsApp</button>
      </div>
      {mode === "invite" && <button type="button" className="button button-quiet" onClick={() => setReplay((n) => n + 1)} disabled={!draft.site.opening_animation} title={draft.site.opening_animation ? "Show the opening again" : "The opening animation is off"}><RotateCcw size={14} aria-hidden="true" /> Replay opening</button>}
    </div>
    <div className="field-grid phone-options">
      <Select label="Preview as" value={guestId} onChange={(event) => setGuestId(event.target.value)}>
        <option value="">Sample guest (all functions)</option>
        {guests.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}
      </Select>
      <Select label="Language" value={lang} onChange={(event) => setLang(event.target.value as LanguageCode)}>{LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</Select>
    </div>
    <div className="phone-frame">
      <div className="phone-screen guest-portal-shell">
        {mode === "invite" ? <PortalPreview data={portal} lang={lang} setLang={setLang} replay={replay} embedded />
          : <WhatsAppMock data={data} draft={draft} photo={photo} lang={lang} guestName={guestName} fnRows={fnRows} />}
      </div>
    </div>
    <p className="field-help">{mode === "invite" ? "The guest page with your unsaved changes. Replies are switched off in previews." : "How the card and message arrive when you share them from Share. Your real message contains the guest's private link."}</p>
  </div>;
}

function WhatsAppMock({ data, draft, photo, lang, guestName, fnRows }: { data: Data; draft: Draft; photo: string | null; lang: LanguageCode; guestName: string; fnRows: Data["functions"] }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const card = buildCardProps({ theme: draft.theme, accent: draft.useAccent ? draft.accent : null, overrides: draft.texts, language: lang, couple: data.coupleNames, greetingName: guestName, functions: fnRows, photoUrl: photo, showMonogram: draft.showMonogram });
  const message = shareMessage(resolveTexts(lang, draft.texts), { name: guestName, couple: data.coupleNames, link: `${origin}/guest#…` });
  return <div className="wa-mock" lang={lang}>
    <div className="wa-header"><span className="wa-avatar" aria-hidden="true">{guestName.slice(0, 1)}</span><span>{guestName}</span></div>
    <div className="wa-chat">
      <div className="wa-bubble">
        <div className="wa-card"><InvitationCard {...card} /></div>
        <p className="wa-text">{message}</p>
        <span className="wa-time">11:02 ✓✓</span>
      </div>
    </div>
  </div>;
}

function PhotoUploader({ data, design, onPreview }: { data: Data; design: Design; onPreview?: (photo: string | null) => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data.canEdit) return null;
  return <div className="photo-uploader">
    <div className="photo-thumb" aria-hidden="true">{(photo ?? design.photo_data) ? <img src={photo ?? design.photo_data!} alt="" /> : <ImageIcon size={22} />}</div>
    <div className="section-stack">
      <p className="field-label">Couple photo (optional)</p>
      <p className="field-help">Shown in a circle on the card and on guests' pages. It is resized on this device to at most 900 px before upload. Only invited guests with a valid link can see it.</p>
      <label className="button button-secondary photo-pick">{busy ? "Preparing…" : "Choose photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" disabled={busy} onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          setBusy(true); setError("");
          try { const resized = await resizePhoto(file); setPhoto(resized); onPreview?.(resized); } catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
        }} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {photo && <ActionForm action={saveDesignPhotoAction} submitLabel="Save photo" variant="primary" className="inline-action-form">
        <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="designId" value={design.id} /><input type="hidden" name="version" value={design.version} /><input type="hidden" name="photo" value={photo} />
      </ActionForm>}
      {!photo && design.photo_data && <ActionForm action={saveDesignPhotoAction} submitLabel="Remove photo" variant="quiet" className="inline-action-form">
        <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="designId" value={design.id} /><input type="hidden" name="version" value={design.version} /><input type="hidden" name="photo" value="" />
      </ActionForm>}
    </div>
  </div>;
}

/** Makes an 8-second 9:16 video of this guest's card on this device, with optional own music. */
function VideoMaker({ card, theme, accent, language, guestName, message }: { card: ReturnType<typeof guestCard>; theme: ThemeId; accent: string | null; language: LanguageCode; guestName: string; message: string }) {
  const storyRef = useRef<HTMLDivElement>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);
  const make = async () => {
    setError(""); setProgress(0);
    try {
      const svg = storyRef.current?.querySelector("svg");
      if (!svg) throw new Error("The card is not ready.");
      const themeInfo = themeById(theme);
      const result = await recordInvitationVideo({
        cardImage: await svgElementToPng(svg), background: themeInfo.background, petalColor: "#fffef8",
        outroText: PORTAL_STRINGS[language].openInvitation, outroFont: `600 40px ${getComputedStyle(document.body).fontFamily}`,
        audio: music, onProgress: setProgress,
      });
      if (video) URL.revokeObjectURL(video.url);
      const file = new File([result.blob], cardFileName(guestName).replace(/\.png$/, `.${result.extension}`), { type: result.blob.type });
      setVideo({ url: URL.createObjectURL(file), file });
      if (result.extension === "webm") setError("This browser saved the video as WebM, which WhatsApp may not accept. For MP4, make the video in Safari or a recent Chrome.");
    } catch (problem) { setError((problem as Error).message); } finally { setProgress(null); }
  };
  const share = async () => {
    if (!video) return;
    try {
      if (navigator.canShare?.({ files: [video.file] })) await navigator.share({ files: [video.file], text: message });
      else setError("This browser cannot share videos directly. Download it, then attach it in WhatsApp.");
    } catch (problem) { if ((problem as Error).name !== "AbortError") setError((problem as Error).message); }
  };
  return <details className="video-maker">
    <summary><Clapperboard size={15} aria-hidden="true" /> Make a video invitation (8 seconds)</summary>
    <div className="sr-only" ref={storyRef} aria-hidden="true"><FormattedCard format="story" card={card} /></div>
    <p className="field-help">An animated 9:16 version of this card with falling jasmine petals, made on this device. Keep this page open and visible while it records.</p>
    <label className="field"><span className="field-label">Music (optional, your own file)</span>
      <input type="file" accept="audio/*" onChange={(event) => setMusic(event.target.files?.[0] ?? null)} />
      <span className="field-help">Only use music you have the rights to share. The first 8 seconds are used, fading in and out.</span>
    </label>
    <div className="doc-actions">
      <button type="button" className="button button-secondary" disabled={progress !== null} onClick={make}>{progress !== null ? `Recording… ${Math.round(progress * 100)}%` : video ? "Make again" : "Make video"}</button>
      {video && <><button type="button" className="button button-primary" onClick={share}><Share2 size={15} aria-hidden="true" /> Share video & message</button>
        <a className="button button-secondary" href={video.url} download={video.file.name}><Download size={15} aria-hidden="true" /> Download video</a></>}
    </div>
    {video && <video className="video-preview" src={video.url} controls playsInline muted={!music} />}
    {error && <p className="field-error" role="alert">{error}</p>}
  </details>;
}

function guestHousehold(data: Data, guest: Guest) { return data.households.find((household) => household.id === guest.household_id); }
function guestFunctions(data: Data, guest: Guest) {
  const invited = new Set(data.invitations.filter((row) => row.guest_id === guest.id).map((row) => row.function_id));
  return data.functions.filter((fn) => invited.has(fn.id));
}
type CardDesign = Pick<Design, "theme" | "accent" | "texts"> & { photo_data?: string | null; show_monogram?: boolean };
function guestCard(data: Data, design: CardDesign, guest: Guest, language: LanguageCode) {
  return buildCardProps({ theme: design.theme, accent: design.accent, overrides: design.texts, language, couple: data.coupleNames, greetingName: guest.full_name, functions: guestFunctions(data, guest), photoUrl: design.photo_data ?? null, showMonogram: design.show_monogram !== false });
}

type SendFilter = "all" | "unsent" | "unopened" | "opened";
function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

function SendPanel({ data, design, guests }: { data: Data; design: Design; guests: Guest[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<SendFilter>("all");
  const [queue, setQueue] = useState(false);
  const sentFor = (guest: Guest) => data.sent.filter((row) => row.guest_id === guest.id && row.dedupe_key.startsWith(`invite:${design.id}:`));
  const openedAt = (guest: Guest) => data.linkActivity[guest.id]?.lastOpenedAt ?? null;
  const matchesFilter = (guest: Guest) => filter === "all" ? true : filter === "unsent" ? !sentFor(guest).length : filter === "unopened" ? sentFor(guest).length > 0 && !openedAt(guest) : Boolean(openedAt(guest));
  const shown = guests.filter((guest) => `${guest.full_name} ${guest.email} ${guest.phone}`.toLowerCase().includes(query.toLowerCase()) && matchesFilter(guest));
  const unsent = guests.filter((guest) => !sentFor(guest).length);
  // Send queue: work through unsent guests in order; recording a share moves to the next one.
  const startQueue = () => { setQueue(true); setFilter("all"); setQuery(""); setOpen(unsent[0]?.id ?? null); };
  const next = (afterId: string) => { const rest = unsent.filter((guest) => guest.id !== afterId); setOpen(rest[0]?.id ?? null); if (!rest.length) setQueue(false); };
  if (!guests.length) return <Card><EmptyState title="Nobody is invited yet" description="Invite people to a function on the Guest list page before preparing their private links." /></Card>;
  const done = guests.filter((guest) => sentFor(guest).length > 0).length;
  return <>{data.canEdit && <BulkLinks data={data} design={design} />}<Card title={`Share “${design.name}”`} subtitle={`${done} of ${guests.length} guests recorded as sent. Each person has a separate card and private link.`}>
    <div className="table-toolbar">
      <TextInput label="Find an individual guest" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="filter-group" role="group" aria-label="Filter guests">
        {([["all", "All"], ["unsent", `Not sent (${unsent.length})`], ["unopened", "Sent, not opened"], ["opened", "Opened"]] as Array<[SendFilter, string]>).map(([value, label]) => <button key={value} type="button" className={`chip ${filter === value ? "is-active" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      {data.canEdit && unsent.length > 0 && !queue && <button type="button" className="button button-primary" onClick={startQueue}><Send size={15} aria-hidden="true" /> Send in order ({unsent.length} left)</button>}
      {queue && <button type="button" className="button button-quiet" onClick={() => { setQueue(false); setOpen(null); }}>Stop sending in order</button>}
    </div>
    {queue && <p className="demo-note" role="status">Sending in order: after you record how you sent each invitation, the next guest opens automatically.</p>}
    <ul className="doc-list">{shown.map((guest) => {
      const sent = sentFor(guest);
      const household = guestHousehold(data, guest);
      const contact = { phone: guest.phone, email: guest.email };
      return <li key={guest.id} className="travel-guest">
        <div className="ops-head"><h3 className="row-title">{guest.full_name}</h3>{sent.length ? <span className="status status-confirmed">✓ Sent manually · {[...new Set(sent.map((row) => row.channel))].join(", ")}</span> : <span className="status status-pending">Not sent yet</span>}
          {openedAt(guest) ? <span className="status status-complete" title="When this guest last opened their private link">Opened {timeAgo(openedAt(guest)!)}</span> : sent.length ? <span className="status status-neutral">Not opened yet</span> : null}</div>
        <p className="row-meta">{guestFunctions(data, guest).map((fn) => fn.name).join(", ")} · {household?.name ?? "No household"} · {[contact.phone, contact.email].filter(Boolean).join(" · ") || "No individual phone or email on record"}{sent[0]?.sent_at ? ` · last ${formatDateTime(sent[0].sent_at, data.wedding.timezone)}` : ""}</p>
        {data.canEdit && <div className="doc-actions">
          {open !== guest.id && <button type="button" className="button button-primary" onClick={() => setOpen(guest.id)}><Share2 size={15} aria-hidden="true" /> Prepare individual invitation</button>}
        </div>}
        {open === guest.id && <SharePanel data={data} design={design} guest={guest} household={household} contact={contact} onClose={() => { setOpen(null); setQueue(false); }} onRecorded={queue ? () => next(guest.id) : undefined} />}
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

function SharePanel({ data, design, guest, household, contact, onClose, onRecorded }: { data: Data; design: Design; guest: Guest; household?: Household; contact: { phone: string; email: string }; onClose: () => void; onRecorded?: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ error?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);
  const language = household?.preferred_language ?? "en";
  const card = guestCard(data, design, guest, language);
  const [format, setFormat] = useState<CardFormat>("portrait");
  const qr = useMemo(() => format === "print" && link ? qrPath(link) : null, [format, link]);
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
    if (!result.error && onRecorded) window.setTimeout(onRecorded, 600);
  };
  const whatsapp = whatsappUrl(contact.phone, message);
  return <div className="share-panel">
    <div className="section-stack">
      <div className="invite-preview small" ref={cardRef}><FormattedCard format={format} card={card} qr={qr} qrLabel={PORTAL_STRINGS[language].openInvitation} /></div>
      <Select label="Card format" value={format} onChange={(event) => setFormat(event.target.value as CardFormat)} hint={CARD_FORMATS[format].hint + (format === "print" && !link ? " Create the link first to add the QR code." : "")}>
        {(Object.keys(CARD_FORMATS) as CardFormat[]).map((value) => <option key={value} value={value}>{CARD_FORMATS[value].label}</option>)}
      </Select>
    </div>
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
        <VideoMaker card={card} theme={design.theme} accent={design.accent} language={language} guestName={guest.full_name} message={message} />
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
