import { useId, type ReactNode } from "react";
import { readableAccent, themeById, type ThemeId } from "@/lib/invitations/content";

export type CardFunction = { name: string; when: string; venue: string | null };
export type InvitationCardProps = {
  theme: ThemeId; accent?: string | null; greeting: string; heading: string; couple: string; body: string;
  functionsHeading: string; functions: CardFunction[]; rsvp: string; closing: string; lang: string; title?: string;
  /** Couple photo (data URL in the studio, /guest/photo in the portal). */
  photoUrl?: string | null;
  /** Initials shown in a small seal when there is no photo, e.g. "P · A". */
  monogram?: string | null;
  /** Save the Date: the formatted date and the place; replaces the function list. */
  saveTheDate?: { date: string; city: string } | null;
};

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
// CSS variables from next/font. They must be set through `style` (SVG presentation attributes do
// not resolve var()); the PNG export swaps them for the resolved family names and embeds the fonts.
export const SERIF = "var(--font-display-stack, Georgia, serif)";
export const SANS = "var(--font-sans-stack, system-ui, sans-serif)";

/** Splits text into lines of roughly `max` characters on word boundaries (good enough for all four scripts). */
export function wrapText(text: string, max: number, maxLines = 4): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > max) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[.,;]?$/, "")}…`; return kept; }
  return lines;
}

const graphemes = (text: string): string[] => typeof Intl !== "undefined" && "Segmenter" in Intl
  ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment)
  : Array.from(text);

/**
 * Approximate rendered width in px. Kannada and Devanagari clusters are wider than Latin letters,
 * so counting characters wrapped them unevenly; this estimates per grapheme and script instead.
 */
export function estimateWidth(text: string, size: number): number {
  let units = 0;
  for (const cluster of graphemes(text)) {
    const code = cluster.codePointAt(0) ?? 0;
    if (/\s/.test(cluster)) units += 0.28;
    else if (code >= 0x0900 && code <= 0x0dff) units += 0.8;
    else if (/[A-Z0-9&]/.test(cluster)) units += 0.64;
    else units += 0.5;
  }
  return units * size;
}

/** Wraps text to a pixel width, shrinking the font (down to minSize) until it fits in maxLines. */
export function fitLines(text: string, options: { maxWidth: number; size: number; minSize: number; maxLines: number }): { lines: string[]; size: number } {
  const wrapAt = (size: number) => {
    const lines: string[] = []; let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && estimateWidth(next, size) > options.maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  for (let size = options.size; size >= options.minSize; size -= 2) {
    const lines = wrapAt(size);
    if (lines.length <= options.maxLines && lines.every((line) => estimateWidth(line, size) <= options.maxWidth)) return { lines, size };
  }
  const lines = wrapAt(options.minSize);
  if (lines.length <= options.maxLines) return { lines, size: options.minSize };
  const kept = lines.slice(0, options.maxLines);
  kept[options.maxLines - 1] = `${kept[options.maxLines - 1]!.replace(/[.,;]?$/, "")}…`;
  return { lines: kept, size: options.minSize };
}

export function Lines({ lines, x, y, size, gap = 1.3, fill, family = SERIF, weight = 400, style }: { lines: string[]; x: number; y: number; size: number; gap?: number; fill: string; family?: string; weight?: number; style?: string }) {
  return <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight={weight} fontStyle={style} fill={fill} style={{ fontFamily: family }}>
    {lines.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : size * gap}>{line}</tspan>)}
  </text>;
}

/** Jasmine string: buds along a drooping curve. */
function Garland({ x1, x2, y, sag, fill }: { x1: number; x2: number; y: number; sag: number; fill: string }) {
  const buds: ReactNode[] = [];
  for (let i = 0; i <= 26; i += 1) {
    const t = i / 26; const x = x1 + (x2 - x1) * t; const yy = y + 4 * sag * t * (1 - t);
    buds.push(<ellipse key={i} cx={x} cy={yy} rx={7} ry={10} fill={fill} transform={`rotate(${(t - 0.5) * 60} ${x} ${yy})`} />);
  }
  return <g>{buds}<path d={`M${x1} ${y} Q${(x1 + x2) / 2} ${y + 2 * sag} ${x2} ${y}`} stroke="#9bb07a" strokeWidth={2} fill="none" /></g>;
}

export function Motifs({ theme, accent, soft }: { theme: ThemeId; accent: string; soft: string }) {
  switch (theme) {
    case "mallige":
      return <g>
        <rect x={34} y={34} width={1012} height={1282} fill="none" stroke={accent} strokeWidth={4} />
        <rect x={50} y={50} width={980} height={1250} fill="none" stroke={accent} strokeWidth={1.5} />
        <Garland x1={60} x2={540} y={70} sag={70} fill="#fffef8" /><Garland x1={540} x2={1020} y={70} sag={70} fill="#fffef8" />
        {[300, 780].map((x) => <g key={x}>{[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx={x} cy={150 + i * 22} rx={7} ry={10} fill="#fffef8" stroke={soft} />)}<circle cx={x} cy={290} r={10} fill={accent} /></g>)}
        <Garland x1={240} x2={840} y={1270} sag={-40} fill="#fffef8" />
      </g>;
    case "veena":
      return <g>
        <rect x={30} y={30} width={1020} height={1290} fill="none" stroke={accent} strokeWidth={6} />
        <rect x={52} y={52} width={976} height={1246} fill="none" stroke={accent} strokeWidth={1.5} strokeDasharray="2 10" />
        <text x={540} y={140} textAnchor="middle" style={{ fontFamily: SERIF }} fontSize={30} letterSpacing={14} fill={accent} opacity={0.75}>Sa · Ri · Ga · Ma · Pa · Da · Ni</text>
        <g transform="translate(860 1110) rotate(-35)" fill={accent} opacity={0.85}>
          <circle cx={0} cy={0} r={70} /><circle cx={0} cy={0} r={52} fill={soft} />
          <rect x={-9} y={-430} width={18} height={400} rx={6} />
          <circle cx={0} cy={-450} r={26} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={-22} y={-110 - i * 38} width={44} height={4} />)}
        </g>
        <path d="M120 1180 q30 -40 60 0 t60 0" stroke={accent} strokeWidth={3} fill="none" opacity={0.6} />
      </g>;
    case "kolam": {
      const dots: ReactNode[] = [];
      for (const [cx, cy] of [[150, 150], [930, 150], [150, 1200], [930, 1200]] as const) {
        for (let i = -2; i <= 2; i += 1) for (let j = -2; j <= 2; j += 1) if (Math.abs(i) + Math.abs(j) <= 2) dots.push(<circle key={`${cx}-${cy}-${i}-${j}`} cx={cx + i * 34} cy={cy + j * 34} r={4.5} fill={accent} />);
        dots.push(<g key={`loop-${cx}-${cy}`} fill="none" stroke={accent} strokeWidth={3}>
          <path d={`M${cx - 68} ${cy} Q${cx} ${cy - 110} ${cx + 68} ${cy} Q${cx} ${cy + 110} ${cx - 68} ${cy}Z`} />
          <path d={`M${cx} ${cy - 68} Q${cx + 110} ${cy} ${cx} ${cy + 68} Q${cx - 110} ${cy} ${cx} ${cy - 68}Z`} />
        </g>);
      }
      return <g><rect x={40} y={40} width={1000} height={1270} rx={24} fill="none" stroke={accent} strokeWidth={4} strokeDasharray="1 14" strokeLinecap="round" />{dots}</g>;
    }
    case "thoranam":
      return <g>
        <path d="M30 60 L1050 60" stroke="#6b4b2a" strokeWidth={4} />
        {Array.from({ length: 17 }, (_, i) => 60 + i * 60).map((x, i) => i % 2 === 0
          ? <path key={x} d={`M${x} 60 q-18 60 0 120 q18 -60 0 -120`} fill="#3f7d3a" stroke="#2c5a28" strokeWidth={2} />
          : <g key={x}><circle cx={x} cy={84} r={18} fill={accent} /><circle cx={x} cy={84} r={8} fill="#c85f12" /></g>)}
        <rect x={60} y={230} width={960} height={1060} rx={12} fill="none" stroke={soft} strokeWidth={10} />
        <path d="M90 1290 q60 -120 120 0 M870 1290 q60 -120 120 0" stroke="#3f7d3a" strokeWidth={8} fill="none" />
      </g>;
    case "yakshagana":
      return <g>
        <path d="M80 1300 L80 360 Q80 110 540 90 Q1000 110 1000 360 L1000 1300" fill="none" stroke={accent} strokeWidth={10} />
        <path d="M110 1300 L110 370 Q110 145 540 125 Q970 145 970 370 L970 1300" fill="none" stroke={soft} strokeWidth={6} />
        {Array.from({ length: 11 }, (_, i) => i).map((i) => { const angle = Math.PI * (0.12 + 0.76 * i / 10); const x = 540 - Math.cos(angle) * 300; const y = 300 - Math.sin(angle) * 170; return <g key={i}><circle cx={x} cy={y} r={14} fill={accent} /><circle cx={x} cy={y} r={6} fill="#fff6dc" /></g>; })}
        <path d="M380 300 Q540 170 700 300" fill="none" stroke={accent} strokeWidth={4} />
      </g>;
    case "kanchi":
      return <g>
        <rect x={0} y={0} width={1080} height={120} fill={soft} />
        <rect x={0} y={1230} width={1080} height={120} fill={soft} />
        {Array.from({ length: 18 }, (_, i) => i * 60).map((x) => <g key={x} fill={accent}>
          <path d={`M${x} 120 L${x + 30} 70 L${x + 60} 120Z`} />
          <path d={`M${x} 1230 L${x + 30} 1280 L${x + 60} 1230Z`} />
        </g>)}
        <rect x={0} y={128} width={1080} height={6} fill={accent} /><rect x={0} y={1216} width={1080} height={6} fill={accent} />
        <circle cx={540} cy={60} r={20} fill="none" stroke={accent} strokeWidth={4} />
      </g>;
  }
}

/** The card's drawing (1080×1350 units), usable inside any outer SVG frame. */
export function InvitationCardBody(props: InvitationCardProps) {
  const clipId = `card-photo-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const theme = themeById(props.theme);
  const accent = props.accent || theme.accent; // borders and motifs
  const accentText = readableAccent(props.theme, props.accent); // text: always at least 4.5:1
  const top = props.theme === "kanchi" ? 250 : props.theme === "thoranam" ? 300 : 290;
  // A photo or monogram sits above the greeting and pushes the text down.
  const photoCenter = top + 30; const photoRadius = 112;
  const sealCenter = top + 6; const sealRadius = 54;
  let y = props.photoUrl ? photoCenter + photoRadius + 58 : props.monogram ? sealCenter + sealRadius + 54 : top;
  const greeting = fitLines(props.greeting, { maxWidth: 900, size: 34, minSize: 26, maxLines: 1 });
  const heading = fitLines(props.heading, { maxWidth: 900, size: 26, minSize: 20, maxLines: 1 });
  const couple = fitLines(props.couple, { maxWidth: 920, size: props.photoUrl ? 64 : 72, minSize: 44, maxLines: 2 });
  const body = fitLines(props.body, { maxWidth: 900, size: 32, minSize: 24, maxLines: 3 });
  const greetingY = y; y += 60;
  const headingY = y; y += couple.size + 18;
  const coupleY = y; y += (couple.lines.length - 1) * couple.size * 1.12 + 52;
  const bodyY = y; y += body.lines.length * body.size * 1.3 + 30;
  const functionsHeadingY = y; y += 56;
  const functionsY = y;
  // Fit as many functions as there is room for above the reply line; show "+N" for the rest.
  const room = Math.max(0, Math.floor((1110 - functionsY - 38) / 92) + 1);
  const shown = props.functions.slice(0, props.functions.length > room ? Math.max(0, room - 1) : room);
  const hidden = props.functions.length - shown.length;
  const rsvp = fitLines(props.rsvp, { maxWidth: 960, size: 25, minSize: 20, maxLines: 2 });
  const portrait = props.photoUrl ? <g>
      <defs><clipPath id={clipId}><circle cx={540} cy={photoCenter} r={photoRadius} /></clipPath></defs>
      <image href={props.photoUrl} x={540 - photoRadius} y={photoCenter - photoRadius} width={photoRadius * 2} height={photoRadius * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
      <circle cx={540} cy={photoCenter} r={photoRadius} fill="none" stroke={accent} strokeWidth={6} />
      <circle cx={540} cy={photoCenter} r={photoRadius + 12} fill="none" stroke={accent} strokeWidth={1.5} strokeDasharray="2 8" />
    </g> : props.monogram ? <g>
      <circle cx={540} cy={sealCenter} r={sealRadius} fill="none" stroke={accent} strokeWidth={3} />
      <circle cx={540} cy={sealCenter} r={sealRadius - 8} fill="none" stroke={accent} strokeWidth={1} />
      <Lines lines={[props.monogram]} x={540} y={sealCenter + 13} size={36} fill={accentText} family={SERIF} weight={600} />
    </g> : null;
  if (props.saveTheDate) {
    // Save the Date: a big label, the names, the date and the place. No function list or reply line.
    const label = fitLines(props.heading.toLocaleUpperCase(), { maxWidth: 880, size: 64, minSize: 40, maxLines: 1 });
    const stdCouple = fitLines(props.couple, { maxWidth: 920, size: 86, minSize: 52, maxLines: 2 });
    const stdBody = fitLines(props.body, { maxWidth: 900, size: 34, minSize: 26, maxLines: 2 });
    const date = fitLines(props.saveTheDate.date, { maxWidth: 900, size: 52, minSize: 34, maxLines: 2 });
    let sy = props.photoUrl ? photoCenter + photoRadius + 80 : props.monogram ? sealCenter + sealRadius + 90 : top + 40;
    const greetingAt = sy; sy += 92;
    const labelAt = sy; sy += label.size + 50;
    const coupleAt = sy; sy += (stdCouple.lines.length - 1) * stdCouple.size * 1.1 + 64;
    const bodyAt = sy; sy += stdBody.lines.length * stdBody.size * 1.3 + 44;
    const dateAt = sy; sy += (date.lines.length - 1) * date.size * 1.2 + 62;
    return <>
      <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={theme.background} />
      <Motifs theme={theme.id} accent={accent} soft={theme.soft} />
      {portrait}
      <Lines lines={greeting.lines} x={540} y={greetingAt} size={greeting.size} fill={theme.ink} family={SERIF} style="italic" />
      <text x={540} y={labelAt} textAnchor="middle" fontSize={label.size} fontWeight={700} letterSpacing={label.size * 0.12} fill={accentText} style={{ fontFamily: SANS }}>{label.lines[0]}</text>
      <Lines lines={stdCouple.lines} x={540} y={coupleAt} size={stdCouple.size} gap={1.1} fill={theme.ink} family={SERIF} weight={600} />
      <Lines lines={stdBody.lines} x={540} y={bodyAt} size={stdBody.size} fill={theme.ink} family={SERIF} style="italic" />
      <rect x={390} y={dateAt - date.size - 22} width={300} height={2} fill={accent} />
      <Lines lines={date.lines} x={540} y={dateAt} size={date.size} gap={1.2} fill={theme.ink} family={SERIF} weight={600} />
      {props.saveTheDate.city && <text x={540} y={sy} textAnchor="middle" fontSize={30} fontWeight={600} letterSpacing={6} fill={accentText} style={{ fontFamily: SANS }}>{props.saveTheDate.city.toLocaleUpperCase()}</text>}
      <Lines lines={[props.closing]} x={540} y={1240} size={30} fill={accentText} family={SERIF} style="italic" />
    </>;
  }
  return <>
    <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={theme.background} />
    <Motifs theme={theme.id} accent={accent} soft={theme.soft} />
    {portrait}
    <Lines lines={greeting.lines} x={540} y={greetingY} size={greeting.size} fill={theme.ink} family={SERIF} style="italic" />
    <Lines lines={heading.lines} x={540} y={headingY} size={heading.size} fill={accentText} family={SANS} weight={600} />
    <Lines lines={couple.lines} x={540} y={coupleY} size={couple.size} gap={1.12} fill={theme.ink} family={SERIF} weight={600} />
    <Lines lines={body.lines} x={540} y={bodyY} size={body.size} fill={theme.ink} family={SERIF} />
    {shown.length > 0 && <>
      <Lines lines={[props.functionsHeading]} x={540} y={functionsHeadingY} size={26} fill={accentText} family={SANS} weight={700} />
      {shown.map((fn, index) => { const name = fitLines(fn.name, { maxWidth: 900, size: 32, minSize: 24, maxLines: 1 }); const detail = fitLines([fn.when, fn.venue].filter(Boolean).join(" · "), { maxWidth: 960, size: 23, minSize: 18, maxLines: 1 }); return <g key={index}>
        <Lines lines={name.lines} x={540} y={functionsY + index * 92} size={name.size} fill={theme.ink} family={SERIF} weight={600} />
        <Lines lines={detail.lines} x={540} y={functionsY + index * 92 + 38} size={detail.size} fill={theme.ink} family={SANS} />
      </g>; })}
      {hidden > 0 && <Lines lines={[`+${hidden}`]} x={540} y={functionsY + shown.length * 92} size={26} fill={accentText} family={SANS} weight={700} />}
    </>}
    <Lines lines={rsvp.lines} x={540} y={1175} size={rsvp.size} fill={theme.ink} family={SANS} />
    <Lines lines={[props.closing]} x={540} y={1240} size={30} fill={accentText} family={SERIF} style="italic" />
  </>;
}

/**
 * The invitation card as an SVG (1080×1350, 4:5 for WhatsApp). Rendered in the studio, in the guest
 * portal, and converted to PNG on the planner's device for sharing.
 */
export function InvitationCard(props: InvitationCardProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`} width="100%" role="img" aria-label={props.title ?? `${props.couple}: ${props.saveTheDate ? "save the date" : "wedding invitation"}`} lang={props.lang} className="invitation-card">
    <InvitationCardBody {...props} />
  </svg>;
}

export type CardFormat = "portrait" | "story" | "square" | "print";
export const CARD_FORMATS: Record<CardFormat, { width: number; height: number; label: string; hint: string }> = {
  portrait: { width: 1080, height: 1350, label: "Portrait (4:5)", hint: "Best for WhatsApp and email." },
  story: { width: 1080, height: 1920, label: "Status / Story (9:16)", hint: "For WhatsApp Status or Instagram Stories." },
  square: { width: 1080, height: 1080, label: "Square (1:1)", hint: "For chats and social posts." },
  print: { width: 1748, height: 2480, label: "Print A5 with QR code", hint: "A5 at 300 dpi-ready size; the QR opens this guest's private invitation." },
};

/**
 * The card in another shape. The 4:5 design is placed inside a themed frame, so every format
 * matches the original. The print format adds the guest's own QR code.
 */
export function FormattedCard({ format, card, qr, qrLabel }: { format: CardFormat; card: InvitationCardProps; qr?: { size: number; d: string } | null; qrLabel?: string }) {
  if (format === "portrait") return <InvitationCard {...card} />;
  const theme = themeById(card.theme);
  const accent = card.accent || theme.accent;
  const { width, height } = CARD_FORMATS[format];
  const placement = format === "story" ? { x: 0, y: 285, w: 1080, h: 1350 } : format === "square" ? { x: 108, y: 0, w: 864, h: 1080 } : { x: 0, y: 0, w: 1748, h: 2185 };
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={card.title ?? `${card.couple}: wedding invitation`} lang={card.lang} className="invitation-card">
    <rect width={width} height={height} fill={format === "square" ? theme.soft : theme.background} />
    {format === "story" && <>
      <rect x={0} y={0} width={1080} height={285} fill={theme.soft} />
      <rect x={0} y={1635} width={1080} height={285} fill={theme.soft} />
      <rect x={0} y={281} width={1080} height={4} fill={accent} /><rect x={0} y={1635} width={1080} height={4} fill={accent} />
      <Lines lines={[card.couple]} x={540} y={165} size={54} fill={theme.ink} family={SERIF} weight={600} />
      <Lines lines={[card.closing]} x={540} y={1790} size={40} fill={theme.ink} family={SERIF} style="italic" />
    </>}
    <svg x={placement.x} y={placement.y} width={placement.w} height={placement.h} viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}><InvitationCardBody {...card} /></svg>
    {format === "print" && <>
      <rect x={0} y={2185} width={1748} height={295} fill={theme.soft} />
      <rect x={0} y={2185} width={1748} height={5} fill={accent} />
      {qr ? <>
        <rect x={1418} y={2215} width={240} height={240} fill="#ffffff" />
        <svg x={1428} y={2225} width={220} height={220} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges"><path d={qr.d} fill="#111111" /></svg>
        <Lines lines={fitLines(qrLabel ?? "", { maxWidth: 1200, size: 44, minSize: 30, maxLines: 2 }).lines} x={720} y={2320} size={40} fill={theme.ink} family={SERIF} />
      </> : <Lines lines={[qrLabel ?? ""]} x={874} y={2345} size={40} fill={theme.ink} family={SERIF} />}
    </>}
  </svg>;
}
