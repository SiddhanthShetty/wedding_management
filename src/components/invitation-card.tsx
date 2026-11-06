import type { ReactNode } from "react";
import { themeById, type ThemeId } from "@/lib/invitations/content";

export type CardFunction = { name: string; when: string; venue: string | null };
export type InvitationCardProps = {
  theme: ThemeId; accent?: string | null; greeting: string; heading: string; couple: string; body: string;
  functionsHeading: string; functions: CardFunction[]; rsvp: string; closing: string; lang: string; title?: string;
};

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
const SERIF = "'Noto Serif Kannada','Noto Serif Devanagari','Noto Serif',Georgia,'Times New Roman',serif";
const SANS = "'Noto Sans Kannada','Noto Sans Devanagari','Noto Sans',system-ui,sans-serif";

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

function Lines({ lines, x, y, size, gap = 1.3, fill, family = SERIF, weight = 400, style }: { lines: string[]; x: number; y: number; size: number; gap?: number; fill: string; family?: string; weight?: number; style?: string }) {
  return <text x={x} y={y} textAnchor="middle" fontFamily={family} fontSize={size} fontWeight={weight} fontStyle={style} fill={fill}>
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

function Motifs({ theme, accent, soft }: { theme: ThemeId; accent: string; soft: string }) {
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
        <text x={540} y={140} textAnchor="middle" fontFamily={SERIF} fontSize={30} letterSpacing={14} fill={accent} opacity={0.75}>Sa · Ri · Ga · Ma · Pa · Da · Ni</text>
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

/**
 * The invitation card as an SVG (1080×1350, 4:5 for WhatsApp). Rendered in the studio, in the guest
 * portal, and converted to PNG on the planner's device for sharing.
 */
export function InvitationCard(props: InvitationCardProps) {
  const theme = themeById(props.theme);
  const accent = props.accent || theme.accent;
  const coupleLines = wrapText(props.couple, 22, 2);
  const bodyLines = wrapText(props.body, 44, 3);
  let y = props.theme === "kanchi" ? 250 : props.theme === "thoranam" ? 300 : 290;
  const greetingY = y; y += 60;
  const headingY = y; y += 90;
  const coupleY = y; y += coupleLines.length * 82 + 20;
  const bodyY = y; y += bodyLines.length * 42 + 50;
  const functionsHeadingY = y; y += 56;
  const functionsY = y;
  // Fit as many functions as there is room for above the reply line; show "+N" for the rest.
  const room = Math.max(0, Math.floor((1110 - functionsY - 38) / 92) + 1);
  const shown = props.functions.slice(0, props.functions.length > room ? Math.max(0, room - 1) : room);
  const hidden = props.functions.length - shown.length;
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`} width="100%" role="img" aria-label={props.title ?? `${props.couple}: wedding invitation`} lang={props.lang} className="invitation-card">
    <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={theme.background} />
    <Motifs theme={theme.id} accent={accent} soft={theme.soft} />
    <Lines lines={[props.greeting]} x={540} y={greetingY} size={34} fill={theme.ink} family={SERIF} style="italic" />
    <Lines lines={wrapText(props.heading, 48, 1)} x={540} y={headingY} size={26} fill={accent} family={SANS} weight={600} />
    <Lines lines={coupleLines} x={540} y={coupleY} size={72} gap={1.12} fill={theme.ink} family={SERIF} weight={600} />
    <Lines lines={bodyLines} x={540} y={bodyY} size={32} fill={theme.ink} family={SERIF} />
    {shown.length > 0 && <>
      <Lines lines={[props.functionsHeading]} x={540} y={functionsHeadingY} size={26} fill={accent} family={SANS} weight={700} />
      {shown.map((fn, index) => <g key={index}>
        <Lines lines={[fn.name]} x={540} y={functionsY + index * 92} size={32} fill={theme.ink} family={SERIF} weight={600} />
        <Lines lines={wrapText([fn.when, fn.venue].filter(Boolean).join(" · "), 60, 1)} x={540} y={functionsY + index * 92 + 38} size={23} fill={theme.ink} family={SANS} />
      </g>)}
      {hidden > 0 && <Lines lines={[`+${hidden}`]} x={540} y={functionsY + shown.length * 92} size={26} fill={accent} family={SANS} weight={700} />}
    </>}
    <Lines lines={wrapText(props.rsvp, 54, 2)} x={540} y={1175} size={25} fill={theme.ink} family={SANS} />
    <Lines lines={[props.closing]} x={540} y={1240} size={30} fill={accent} family={SERIF} style="italic" />
  </svg>;
}
