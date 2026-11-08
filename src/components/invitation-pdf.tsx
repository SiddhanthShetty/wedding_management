"use client";
import { useId, useRef, useState } from "react";
import { FileDown, Share2 } from "lucide-react";
import { FormattedCard, Lines, Motifs, SANS, SERIF, fitLines, type InvitationCardProps } from "@/components/invitation-card";
import { PORTAL_STRINGS } from "@/lib/guest-portal/i18n";
import { formatFunctionDate, readableAccent, themeById, type LanguageCode } from "@/lib/invitations/content";
import { buildImagePdf } from "@/lib/invitations/pdf";
import { svgElementToImage } from "@/lib/invitations/export-card";
import type { InvitationSite } from "@/lib/invitations/site";

const W = 1748; const H = 2480; // A5 at 300 dpi

export type PdfFunction = { id: string; name: string; function_date: string | null; start_time: string | null; venue_name: string | null };
export type PdfContent = {
  card: InvitationCardProps; language: LanguageCode; site: InvitationSite; partners: string[];
  functions: PdfFunction[]; qr: { size: number; d: string } | null; dateLine: string;
};

function Page({ card, children, label }: { card: InvitationCardProps; children: React.ReactNode; label: string }) {
  const theme = themeById(card.theme);
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} lang={card.lang} className="invitation-card">
    <rect width={W} height={H} fill={theme.background} />
    <svg width={W} height={H} viewBox="0 0 1080 1350" preserveAspectRatio="none"><Motifs theme={theme.id} accent={card.accent || theme.accent} soft={theme.soft} /></svg>
    {children}
  </svg>;
}

/** Every page of the PDF card as SVG, A5 portrait. Save the Date: cover, the card, and the QR page. */
export function PdfPages({ content }: { content: PdfContent }) {
  const clip = `pdf-photo-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { card, site, language } = content;
  const t = PORTAL_STRINGS[language];
  const theme = themeById(card.theme);
  const accent = card.accent || theme.accent;
  const ink = theme.ink; const accentText = readableAccent(card.theme, card.accent);
  const std = Boolean(card.saveTheDate);
  const couple = fitLines(card.couple, { maxWidth: 1400, size: 150, minSize: 90, maxLines: 2 });
  const sorted = [...content.functions].sort((a, b) => `${a.function_date ?? "9999"}${a.start_time ?? ""}`.localeCompare(`${b.function_date ?? "9999"}${b.start_time ?? ""}`));
  const pages: React.ReactNode[] = [];

  // 1. Cover: photo or initials, the label, your names and the date.
  pages.push(<Page key="cover" card={card} label={`${card.couple}: ${std ? t.stdTitle : t.brand}`}>
    {card.photoUrl ? <g>
      <defs><clipPath id={clip}><circle cx={874} cy={860} r={330} /></clipPath></defs>
      <image href={card.photoUrl} x={544} y={530} width={660} height={660} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
      <circle cx={874} cy={860} r={330} fill="none" stroke={accent} strokeWidth={10} />
    </g> : card.monogram ? <g>
      <circle cx={874} cy={860} r={190} fill="none" stroke={accent} strokeWidth={6} />
      <circle cx={874} cy={860} r={170} fill="none" stroke={accent} strokeWidth={2} />
      <Lines lines={[card.monogram]} x={874} y={895} size={96} fill={accentText} family={SERIF} weight={600} />
    </g> : null}
    <text x={874} y={1400} textAnchor="middle" fontSize={56} fontWeight={700} letterSpacing={8} fill={accentText} style={{ fontFamily: SANS }}>{(std ? t.stdTitle : t.brand).toLocaleUpperCase()}</text>
    <Lines lines={couple.lines} x={874} y={1600} size={couple.size} gap={1.1} fill={ink} family={SERIF} weight={600} />
    {content.dateLine && <Lines lines={fitLines(content.dateLine, { maxWidth: 1400, size: 64, minSize: 44, maxLines: 2 }).lines} x={874} y={1600 + couple.lines.length * couple.size * 1.1 + 90} size={60} fill={ink} family={SERIF} />}
  </Page>);

  if (std) {
    pages.push(<FormattedCard key="card" format="print" card={card} qr={null} qrLabel={card.closing} />);
  } else {
    // 2. The invitation: blessing line, greeting, both families, the invitation and the closing.
    const greeting = fitLines(card.greeting, { maxWidth: 1400, size: 64, minSize: 44, maxLines: 1 });
    const body = fitLines(card.body, { maxWidth: 1400, size: 58, minSize: 42, maxLines: 4 });
    const families = [[content.partners[0], site.parents.one], [content.partners[1], site.parents.two]].filter(([name]) => name) as Array<[string, string]>;
    let y = 470;
    const parts: React.ReactNode[] = [];
    if (site.blessing_header) { parts.push(<Lines key="bless" lines={[site.blessing_header]} x={874} y={y} size={56} fill={ink} family={SERIF} />); y += 150; }
    parts.push(<Lines key="greet" lines={greeting.lines} x={874} y={y} size={greeting.size} fill={ink} family={SERIF} style="italic" />); y += 120;
    parts.push(<Lines key="head" lines={fitLines(card.heading, { maxWidth: 1400, size: 50, minSize: 36, maxLines: 1 }).lines} x={874} y={y} size={48} fill={accentText} family={SANS} weight={600} />); y += 170;
    if (families.some(([, line]) => line)) {
      for (const [name, line] of families) {
        parts.push(<Lines key={`n-${name}`} lines={fitLines(name, { maxWidth: 1400, size: 110, minSize: 70, maxLines: 1 }).lines} x={874} y={y} size={104} fill={ink} family={SERIF} weight={600} />); y += 90;
        if (line) { const lines = fitLines(line, { maxWidth: 1350, size: 44, minSize: 34, maxLines: 2 }); parts.push(<Lines key={`p-${name}`} lines={lines.lines} x={874} y={y} size={lines.size} fill={ink} family={SANS} />); y += lines.lines.length * lines.size * 1.3; }
        y += 110;
      }
    } else { parts.push(<Lines key="couple" lines={couple.lines} x={874} y={y} size={couple.size} gap={1.1} fill={ink} family={SERIF} weight={600} />); y += couple.lines.length * couple.size * 1.1 + 40; }
    parts.push(<Lines key="body" lines={body.lines} x={874} y={y + 40} size={body.size} fill={ink} family={SERIF} />);
    parts.push(<Lines key="rsvp" lines={fitLines(card.rsvp, { maxWidth: 1400, size: 46, minSize: 34, maxLines: 2 }).lines} x={874} y={2060} size={44} fill={ink} family={SANS} />);
    parts.push(<Lines key="close" lines={[card.closing]} x={874} y={2200} size={58} fill={accentText} family={SERIF} style="italic" />);
    pages.push(<Page key="invite" card={card} label={card.heading}>{parts}</Page>);

    // 3. One page per function.
    sorted.forEach((fn, index) => {
      const name = fitLines(fn.name, { maxWidth: 1400, size: 140, minSize: 80, maxLines: 2 });
      const when = formatFunctionDate(fn.function_date, fn.start_time, language).split(" · ");
      const venue = fn.venue_name ? fitLines(fn.venue_name, { maxWidth: 1350, size: 60, minSize: 42, maxLines: 2 }) : null;
      const palette = (site.palettes[fn.id] ?? []).filter((color) => /^#[0-9a-fA-F]{6}$/.test(color));
      const nameEnd = 1020 + (name.lines.length - 1) * name.size * 1.1;
      pages.push(<Page key={fn.id} card={card} label={fn.name}>
        <text x={874} y={720} textAnchor="middle" fontSize={46} fontWeight={700} letterSpacing={6} fill={accentText} style={{ fontFamily: SANS }}>{card.functionsHeading.toLocaleUpperCase()} · {index + 1}/{sorted.length}</text>
        <Lines lines={name.lines} x={874} y={1020} size={name.size} gap={1.1} fill={ink} family={SERIF} weight={600} />
        <rect x={724} y={nameEnd + 90} width={300} height={3} fill={accent} />
        {when[0] && <Lines lines={fitLines(when[0], { maxWidth: 1400, size: 66, minSize: 44, maxLines: 1 }).lines} x={874} y={nameEnd + 230} size={64} fill={ink} family={SERIF} />}
        {when[1] && <Lines lines={[when[1]]} x={874} y={nameEnd + 330} size={60} fill={accentText} family={SANS} weight={600} />}
        {venue && <Lines lines={venue.lines} x={874} y={nameEnd + 470} size={venue.size} fill={ink} family={SANS} />}
        {palette.length > 0 && <g>
          <Lines lines={[t.palette]} x={874} y={nameEnd + 700} size={40} fill={accentText} family={SANS} weight={600} />
          {palette.map((color, i) => <circle key={color + i} cx={874 + (i - (palette.length - 1) / 2) * 130} cy={nameEnd + 820} r={48} fill={color} stroke={ink} strokeOpacity={0.25} strokeWidth={3} />)}
        </g>}
      </Page>);
    });
  }

  // Last page: the guest's QR code, then the family names and hashtag.
  const names = site.closing.names.slice(0, 8);
  pages.push(<Page key="qr" card={card} label={t.openInvitation}>
    {content.qr ? <g>
      <rect x={474} y={420} width={800} height={800} rx={24} fill="#ffffff" />
      <svg x={524} y={470} width={700} height={700} viewBox={`0 0 ${content.qr.size} ${content.qr.size}`} shapeRendering="crispEdges"><path d={content.qr.d} fill="#111111" /></svg>
    </g> : null}
    <Lines lines={fitLines(std ? t.stdFollow : t.openInvitation, { maxWidth: 1400, size: 64, minSize: 44, maxLines: 3 }).lines} x={874} y={content.qr ? 1360 : 900} size={60} fill={ink} family={SERIF} />
    {names.length > 0 && <g>
      <text x={874} y={1640} textAnchor="middle" fontSize={44} fontWeight={700} letterSpacing={5} fill={accentText} style={{ fontFamily: SANS }}>{(site.closing.title || t.closingTitle).toLocaleUpperCase()}</text>
      {names.map((name, i) => <Lines key={i} lines={fitLines(name, { maxWidth: 1400, size: 56, minSize: 40, maxLines: 1 }).lines} x={874} y={1740 + i * 76} size={54} fill={ink} family={SERIF} />)}
    </g>}
    {site.hashtag && <Lines lines={[site.hashtag]} x={874} y={2300} size={58} fill={accentText} family={SANS} weight={700} />}
  </Page>);
  return <>{pages}</>;
}

/** Makes the PDF on this device from the hidden pages, then shares or downloads it. */
export function PdfMaker({ content, fileName, message, label = "Make PDF card" }: { content: PdfContent; fileName: string; message?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ busy?: string; error?: string; file?: File }>({});
  const make = async () => {
    setState({ busy: "Preparing pages…" });
    try {
      const svgs = Array.from(ref.current?.querySelectorAll(":scope > svg") ?? []) as SVGSVGElement[];
      if (!svgs.length) throw new Error("The pages are not ready.");
      const pages = [];
      for (const [index, svg] of svgs.entries()) {
        setState({ busy: `Drawing page ${index + 1} of ${svgs.length}…` });
        const blob = await svgElementToImage(svg, "image/jpeg", 0.85);
        pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: W, height: H });
      }
      const pdf = buildImagePdf(pages, { title: `${content.card.couple} - invitation` });
      setState({ file: new File([pdf as BlobPart], fileName, { type: "application/pdf" }) });
    } catch (problem) { setState({ error: (problem as Error).message || "The PDF could not be made." }); }
  };
  const download = () => { if (!state.file) return; const url = URL.createObjectURL(state.file); const a = document.createElement("a"); a.href = url; a.download = state.file.name; a.click(); URL.revokeObjectURL(url); };
  const share = async () => {
    if (!state.file) return;
    try {
      if (navigator.canShare?.({ files: [state.file] })) await navigator.share({ files: [state.file], text: message });
      else setState((current) => ({ ...current, error: "This browser cannot share files directly. Download the PDF, then attach it in WhatsApp or email." }));
    } catch (problem) { if ((problem as Error).name !== "AbortError") setState((current) => ({ ...current, error: (problem as Error).message })); }
  };
  return <div className="section-stack">
    <div className="sr-only" aria-hidden="true" ref={ref}><PdfPages content={content} /></div>
    <div className="doc-actions">
      <button type="button" className="button button-secondary" onClick={make} disabled={Boolean(state.busy)}><FileDown size={15} aria-hidden="true" /> {state.busy ?? (state.file ? "Make again" : label)}</button>
      {state.file && <>
        <button type="button" className="button button-primary" onClick={share}><Share2 size={15} aria-hidden="true" /> Share PDF</button>
        <button type="button" className="button button-secondary" onClick={download}>Download PDF ({(state.file.size / 1_048_576).toFixed(1)} MB)</button>
      </>}
    </div>
    {state.error && <p className="field-error" role="alert">{state.error}</p>}
  </div>;
}

/** The PDF content for one card: the guest's (or a sample's) functions, and a QR code when there is a link. */
export function pdfContent(input: { card: InvitationCardProps; language: LanguageCode; site: InvitationSite; partners: string[]; functions: PdfFunction[]; qr: { size: number; d: string } | null }): PdfContent {
  const first = [...input.functions].filter((fn) => fn.function_date).sort((a, b) => a.function_date!.localeCompare(b.function_date!))[0];
  const dateLine = input.card.saveTheDate ? [input.card.saveTheDate.date, input.card.saveTheDate.city].filter(Boolean).join(" · ") : first ? formatFunctionDate(first.function_date, null, input.language) : "";
  return { ...input, dateLine };
}
