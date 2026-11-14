/**
 * Hand-drawn SVG artwork: the coastal Karnataka scene, lamps, garlands, leaves
 * and the six event illustrations. Everything is vector, so it stays sharp and
 * adds almost nothing to page weight.
 */
import type { ReactNode } from "react";
import type { EventId } from "@/config/invitation";

const C = {
  maroon: "#5E0B12",
  maroonDeep: "#3E0509",
  burgundy: "#8E1B1F",
  red: "#A73320",
  gold: "#B9853A",
  goldBright: "#E2A93A",
  goldDeep: "#7A4A10",
  champagne: "#F1D9A6",
  ivory: "#FBF3E6",
  paper: "#F5E5D1",
  parchment: "#EEDBBF",
  forest: "#3A4B06",
  leaf: "#4E6409",
  leafLight: "#7C8E1C",
  earth: "#6B4A2F",
  terracotta: "#9C4F30",
  turmeric: "#D39A1C",
  marigold: "#D9861C",
  sepia: "#B98A4E",
  sepiaDeep: "#9A6B33",
  sepiaLight: "#E6C99C",
};

/* ── small reusable pieces ─────────────────────────────────────────────── */

function Flower({ x, y, r = 6, petals = 6, fill = C.ivory, center = C.turmeric }: { x: number; y: number; r?: number; petals?: number; fill?: string; center?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: petals }, (_, i) => (
        <ellipse key={i} cx={0} cy={-r * 0.62} rx={r * 0.36} ry={r * 0.6} fill={fill} transform={`rotate(${(360 / petals) * i})`} />
      ))}
      <circle r={r * 0.26} fill={center} />
    </g>
  );
}

function Marigold({ x, y, r = 9, fill = C.marigold }: { x: number; y: number; r?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={0} cy={-r * 0.72} r={r * 0.3} fill={fill} transform={`rotate(${30 * i})`} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <circle key={i} cx={0} cy={-r * 0.4} r={r * 0.27} fill={C.turmeric} transform={`rotate(${45 * i + 20})`} />
      ))}
      <circle r={r * 0.24} fill={fill} />
    </g>
  );
}

function Leaf({ x, y, len = 16, rot = 0, fill = C.leaf }: { x: number; y: number; len?: number; rot?: number; fill?: string }) {
  return <path transform={`translate(${x} ${y}) rotate(${rot})`} d={`M0 0C${len * 0.3} ${-len * 0.32} ${len * 0.75} ${-len * 0.28} ${len} 0C${len * 0.75} ${len * 0.28} ${len * 0.3} ${len * 0.32} 0 0Z`} fill={fill} />;
}

function Sparkle({ x, y, r = 5, fill = C.champagne }: { x: number; y: number; r?: number; fill?: string }) {
  return <path transform={`translate(${x} ${y})`} d={`M0 ${-r}Q${r * 0.18} ${-r * 0.18} ${r} 0Q${r * 0.18} ${r * 0.18} 0 ${r}Q${-r * 0.18} ${r * 0.18} ${-r} 0Q${-r * 0.18} ${-r * 0.18} 0 ${-r}Z`} fill={fill} />;
}

/* ── palms ─────────────────────────────────────────────────────────────── */

const FROND = "M0 0C16 -15 42 -15 60 6C42 -3 20 -2 0 0Z";

export function Palm({ x, y, s = 1, flip = false, kind = "coconut", trunk = C.earth, frond = C.forest }: { x: number; y: number; s?: number; flip?: boolean; kind?: "coconut" | "areca"; trunk?: string; frond?: string }) {
  const coconut = kind === "coconut";
  const top = coconut ? { x: 26, y: -150 } : { x: 0, y: -170 };
  const angles = coconut ? [-78, -48, -16, 20, 46] : [-70, -35, 0, 34];
  const fs = coconut ? 1 : 0.55;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d={coconut ? "M0 0C2 -52 10 -104 26 -150" : "M0 0L0 -170"} fill="none" stroke={trunk} strokeWidth={coconut ? 6 : 3} strokeLinecap="round" />
      <g transform={`translate(${top.x} ${top.y}) scale(${fs})`} fill={frond}>
        {angles.map((a) => (
          <path key={`r${a}`} d={FROND} transform={`rotate(${a})`} />
        ))}
        {angles.map((a) => (
          <path key={`l${a}`} d={FROND} transform={`scale(-1 1) rotate(${a})`} />
        ))}
        {coconut && (
          <g fill={trunk}>
            <circle cx={-5} cy={5} r={4.5} />
            <circle cx={5} cy={6} r={4.5} />
            <circle cx={0} cy={11} r={4} />
          </g>
        )}
      </g>
    </g>
  );
}

/* ── buildings ─────────────────────────────────────────────────────────── */

type BuildingTone = { roof: string; roofLine: string; wall: string; wood: string; opening: string; line: string; trunk: string; frond: string; ground: string };

/** The pale gold-brown sketch style of the coastal scene inside the emblem. */
export const SEPIA: BuildingTone = { roof: "#E3C38F", roofLine: C.sepiaDeep, wall: "#F3DFC0", wood: C.sepia, opening: C.sepia, line: C.sepia, trunk: C.sepia, frond: "#CDA56A", ground: "#E3C38F" };

/** A two-tier, tiled-roof Mangalorean house with a pillared verandah. Origin: bottom-left. 280 × 150. */
export function TiledHouse({ x = 0, y = 0, s = 1, tone = SEPIA }: { x?: number; y?: number; s?: number; tone?: BuildingTone }) {
  const tiles = (x1: number, x2: number, yTop: number, yBot: number, inset: number, rows: number) =>
    Array.from({ length: rows }, (_, i) => {
      const t = (i + 1) / (rows + 1);
      const yy = yTop + (yBot - yTop) * t;
      const dx = inset * (1 - t);
      return <path key={i} d={`M${x1 + dx} ${yy}H${x2 - dx}`} />;
    });
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) translate(0 -150)`}>
      {/* upper storey */}
      <rect x={96} y={34} width={88} height={30} fill={tone.wall} />
      <path d="M72 38L104 8H176L208 38Z" fill={tone.roof} />
      <g stroke={tone.roofLine} strokeWidth={0.8} opacity={0.7}>{tiles(72, 208, 8, 38, 32, 4)}</g>
      <path d="M104 8H176" stroke={tone.roofLine} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M140 0v8" stroke={tone.roofLine} strokeWidth={1.6} />
      <circle cx={140} cy={0} r={2} fill={tone.roofLine} />
      <g fill={tone.opening} opacity={0.85}>
        <rect x={110} y={44} width={12} height={14} />
        <rect x={134} y={44} width={12} height={14} />
        <rect x={158} y={44} width={12} height={14} />
      </g>
      {/* ground storey */}
      <rect x={28} y={92} width={224} height={46} fill={tone.wall} />
      <path d="M0 98L48 58H232L280 98Z" fill={tone.roof} />
      <g stroke={tone.roofLine} strokeWidth={0.8} opacity={0.7}>{tiles(0, 280, 58, 98, 48, 6)}</g>
      <path d="M0 98H280" stroke={tone.roofLine} strokeWidth={2} />
      {/* door and barred windows */}
      <path d="M128 138V110a12 12 0 0 1 24 0V138Z" fill={tone.opening} />
      <g fill={tone.opening} opacity={0.85}>
        <rect x={62} y={108} width={26} height={18} />
        <rect x={192} y={108} width={26} height={18} />
      </g>
      <g stroke={tone.wood} strokeWidth={1.2}>
        <path d="M68.5 108v18M75 108v18M81.5 108v18M198.5 108v18M205 108v18M211.5 108v18" />
      </g>
      {/* carved verandah pillars */}
      <g fill={tone.wood}>
        {[30, 76, 122, 154, 200, 246].map((px) => (
          <g key={px}>
            <rect x={px} y={98} width={4} height={40} />
            <rect x={px - 2.5} y={98} width={9} height={3.5} />
            <rect x={px - 2} y={134.5} width={8} height={3.5} />
          </g>
        ))}
      </g>
      <rect x={14} y={138} width={252} height={7} fill={tone.wood} />
      <rect x={4} y={145} width={272} height={5} fill={tone.roofLine} opacity={0.8} />
    </g>
  );
}

/* ── the hero's coastal scene ──────────────────────────────────────────── */

/** Sea, low sun and a fishing boat. Fills its box; crops from the centre. */
export function SeaAtDusk({ className = "", sepia = true, sunX }: { className?: string; sepia?: boolean; sunX?: number }) {
  const ink = sepia ? C.sepia : C.gold;
  const sun = sunX ?? (sepia ? 1010 : 720);
  return (
    <svg viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <circle cx={sun} cy={120} r={74} fill={sepia ? C.sepiaLight : C.champagne} opacity={sepia ? 0.35 : 0.2} />
      <circle cx={sun} cy={120} r={50} fill={sepia ? C.sepiaLight : C.champagne} opacity={sepia ? 0.7 : 0.5} />
      <rect x={0} y={120} width={1440} height={120} fill={sepia ? C.paper : C.maroonDeep} />
      <path d="M1180 40l6 4 6-4M1210 26l5 3 5-3M1232 50l4 3 4-3" fill="none" stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
      <g fill="none" stroke={ink} strokeWidth={1.1} strokeLinecap="round">
        {[134, 150, 168, 188, 210].map((yy, i) => (
          <path
            key={yy}
            opacity={0.7 - i * 0.1}
            d={`M-20 ${yy}${Array.from({ length: 31 }, (_, k) => `q12 ${k % 2 ? 5 + i : -5 - i} 24 0t24 0`).join("")}`}
          />
        ))}
      </g>
      <g fill={sepia ? C.sepia : C.champagne} opacity={0.45} transform={`translate(${sun - 720} 0)`}>
        <rect x={690} y={126} width={60} height={1.6} />
        <rect x={700} y={140} width={40} height={1.6} />
        <rect x={708} y={156} width={24} height={1.6} />
      </g>
      {/* country boat */}
      <g transform={sepia ? "translate(470 152) scale(0.8)" : "translate(828 150) scale(0.8)"}>
        <path d="M-34 0Q0 13 34 0Q26 9 0 10Q-26 9 -34 0Z" fill={sepia ? C.sepiaDeep : C.gold} />
        <path d="M-2 0V-30" stroke={sepia ? C.sepiaDeep : C.gold} strokeWidth={1.4} />
        <path d="M0 -30Q18 -18 2 -4Z" fill={sepia ? C.sepiaLight : C.champagne} opacity={0.75} />
      </g>
    </svg>
  );
}

export function HouseAndPalms({ className = "", tone = SEPIA }: { className?: string; tone?: BuildingTone }) {
  const { trunk, frond } = tone;
  return (
    <svg viewBox="0 0 420 300" className={className} aria-hidden="true">
      <Palm x={66} y={294} s={1.5} trunk={trunk} frond={frond} />
      <Palm x={22} y={296} s={1.05} kind="areca" trunk={trunk} frond={frond} />
      <Palm x={350} y={292} s={0.95} kind="areca" trunk={trunk} frond={frond} />
      <Palm x={372} y={294} s={1.2} kind="areca" trunk={trunk} frond={frond} />
      <Palm x={398} y={292} s={0.85} kind="areca" trunk={trunk} frond={frond} />
      <TiledHouse x={78} y={292} s={0.98} tone={tone} />
      <Palm x={318} y={296} s={1.15} flip trunk={trunk} frond={frond} />
      <rect x={0} y={290} width={420} height={10} fill={tone.ground} />
    </svg>
  );
}

/* ── lamp, garlands, leaves, divider ───────────────────────────────────── */

export function BananaLeaf({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 130 320" className={className} aria-hidden="true">
      <path d="M64 316C22 258 2 160 30 66C40 30 56 10 64 2C72 10 90 32 100 68C126 160 108 258 64 316Z" fill={C.leaf} />
      <path d="M64 316V2" stroke={C.leafLight} strokeWidth={2.4} />
      <g stroke={C.leafLight} strokeWidth={0.9} opacity={0.8} fill="none">
        {Array.from({ length: 13 }, (_, i) => {
          const y = 36 + i * 21;
          const w = 44 - Math.abs(i - 6) * 3.2;
          return <path key={i} d={`M64 ${y + 16}Q${64 - w * 0.5} ${y + 6} ${64 - w} ${y - 6}M64 ${y + 16}Q${64 + w * 0.5} ${y + 6} ${64 + w} ${y - 6}`} />;
        })}
      </g>
      {/* the leaf's natural tears */}
      <g fill="var(--leaf-ground, #F5E5D1)">
        <path d="M14 150l16 4-15 3Z" />
        <path d="M112 196l-17 5 16 3Z" />
        <path d="M22 232l14 3-13 4Z" />
      </g>
    </svg>
  );
}

/** Section divider: a small lotus between two tapering lines. */
export function Divider({ className = "", color = C.gold }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 240 24" className={`mx-auto h-6 w-60 max-w-full ${className}`} aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth={1} strokeLinecap="round">
        <path d="M4 12H92M148 12H236" />
        <path d="M120 3c5 4 5 12 0 18c-5-6-5-14 0-18Z" />
        <path d="M120 21c-8-1-13-6-14-12c6 1 11 5 14 12ZM120 21c8-1 13-6 14-12c-6 1-11 5-14 12Z" />
      </g>
      <circle cx={98} cy={12} r={1.6} fill={color} />
      <circle cx={142} cy={12} r={1.6} fill={color} />
    </svg>
  );
}

/** Gold corner flourish for framed panels. Rotate with CSS for the other corners. */
export function Corner({ className = "", color = C.gold }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round">
        <path d="M2 58V14Q2 2 14 2H58" />
        <path d="M9 58V20Q9 9 20 9H58" opacity={0.6} />
        <path d="M18 30c0-7 5-12 12-12c-1 7-5 11-12 12Z" />
      </g>
      <circle cx={16} cy={16} r={2} fill={color} />
    </svg>
  );
}

/* ── the six event illustrations (240 × 180) ───────────────────────────── */

const eventArt: Record<EventId, { ground: string; ink: "light" | "dark"; art: ReactNode }> = {
  engagement: {
    ground: C.burgundy,
    ink: "light",
    art: (
      <>
        <circle cx={102} cy={98} r={33} fill="none" stroke={C.goldBright} strokeWidth={7} />
        <circle cx={142} cy={104} r={33} fill="none" stroke={C.champagne} strokeWidth={7} />
        <path d="M102 65a33 33 0 0 1 28 15.5" fill="none" stroke={C.goldBright} strokeWidth={7} />
        <path d="M92 60l10-14l10 14l-10 10Z" fill={C.ivory} />
        <path d="M92 60h20M102 46v24" stroke={C.gold} strokeWidth={0.8} />
        <Leaf x={36} y={150} rot={-30} len={20} />
        <Leaf x={204} y={150} rot={-150} len={20} />
        <Flower x={46} y={136} r={9} />
        <Flower x={66} y={152} r={7} fill={C.red} center={C.goldBright} />
        <Flower x={194} y={136} r={9} />
        <Flower x={174} y={152} r={7} fill={C.red} center={C.goldBright} />
        <Flower x={120} y={158} r={6} />
        <Sparkle x={182} y={52} r={6} />
        <Sparkle x={58} y={70} r={4} />
      </>
    ),
  },
  haldi: {
    ground: "#F1D9A6",
    ink: "dark",
    art: (
      <>
        {/* brass urli heaped with turmeric */}
        <path d="M78 96Q120 34 162 96Z" fill={C.turmeric} />
        <path d="M96 84Q120 50 144 84" fill="none" stroke="#E2B040" strokeWidth={2} strokeLinecap="round" />
        <path d="M56 96h128q-8 46-64 48q-56-2-64-48Z" fill={C.goldDeep} />
        <ellipse cx={120} cy={96} rx={64} ry={8} fill={C.gold} />
        <ellipse cx={120} cy={96} rx={52} ry={5} fill={C.turmeric} />
        <path d="M70 112q50 16 100 0" fill="none" stroke={C.champagne} strokeWidth={1.2} />
        <rect x={98} y={144} width={44} height={6} rx={2} fill={C.goldDeep} />
        {/* small bowls */}
        <path d="M22 132h36q-2 14-18 15q-16-1-18-15Z" fill={C.goldDeep} />
        <ellipse cx={40} cy={132} rx={18} ry={4} fill="#B7361E" />
        <path d="M184 132h36q-2 14-18 15q-16-1-18-15Z" fill={C.goldDeep} />
        <ellipse cx={202} cy={132} rx={18} ry={4} fill={C.ivory} />
        <Marigold x={36} y={62} r={13} />
        <Marigold x={204} y={66} r={13} />
        <Marigold x={64} y={34} r={9} />
        <Marigold x={178} y={34} r={9} />
        <Marigold x={120} y={166} r={8} />
        <Leaf x={48} y={78} rot={30} len={18} fill={C.forest} />
        <Leaf x={192} y={82} rot={150} len={18} fill={C.forest} />
      </>
    ),
  },
  mehendi: {
    ground: C.leaf,
    ink: "light",
    art: (
      <g fill="none" stroke={C.champagne} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        {/* open palm */}
        <path d="M92 168V122q-16-14-22-34q-2-8 4-10q6-1 9 6l9 18V46q0-7 6.5-7q6.5 0 6.5 7V30q0-7 6.5-7q6.5 0 6.5 7v14q0-7 6.5-7q6.5 0 6.5 7v14q0-6 6-6q6 0 6 6v58q0 14-8 24v28" />
        <circle cx={118} cy={110} r={17} />
        <circle cx={118} cy={110} r={10} />
        <circle cx={118} cy={110} r={3} fill={C.champagne} />
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M118 89c2.5-3 2.5-6 0-8c-2.5 2-2.5 5 0 8Z" transform={`rotate(${i * 30} 118 110)`} />
        ))}
        <path d="M98 150q20-10 40 0M98 158q20-10 40 0" />
        <g fill={C.champagne} stroke="none">
          <circle cx={98.5} cy={52} r={2} />
          <circle cx={111.5} cy={38} r={2} />
          <circle cx={124.5} cy={46} r={2} />
          <circle cx={137} cy={60} r={2} />
          <circle cx={98.5} cy={66} r={1.4} />
          <circle cx={111.5} cy={54} r={1.4} />
          <circle cx={124.5} cy={62} r={1.4} />
          <circle cx={137} cy={74} r={1.4} />
        </g>
        {/* paisleys */}
        <path d="M44 60c12 5 18 17 14 28c-3 9-12 13-19 9c-6-3-8-11-4-16c3-4 9-4 11 0c2 3 0 6-3 7" />
        <path d="M196 60c-12 5-18 17-14 28c3 9 12 13 19 9c6-3 8-11 4-16c-3-4-9-4-11 0c-2 3 0 6 3 7" />
        <path d="M40 124q10 10 6 26M200 124q-10 10-6 26" />
        <g fill={C.champagne} stroke="none">
          <circle cx={36} cy={116} r={2.2} />
          <circle cx={204} cy={116} r={2.2} />
          <circle cx={50} cy={156} r={1.8} />
          <circle cx={190} cy={156} r={1.8} />
        </g>
      </g>
    ),
  },
  sangeet: {
    ground: C.maroonDeep,
    ink: "light",
    art: (
      <>
        {/* festoon lights */}
        <path d="M0 14Q60 46 120 18Q180 46 240 14" fill="none" stroke={C.gold} strokeWidth={1} />
        {[[20, 22], [44, 30], [70, 32], [96, 26], [144, 26], [170, 32], [196, 30], [220, 22]].map(([lx, ly]) => (
          <g key={lx}>
            <circle cx={lx} cy={ly! + 5} r={7} fill={C.champagne} opacity={0.18} />
            <circle cx={lx} cy={ly! + 5} r={3.2} fill={C.champagne} />
          </g>
        ))}
        {/* veena */}
        <g transform="rotate(-24 120 110)">
          <rect x={72} y={104} width={132} height={9} rx={3} fill={C.goldDeep} />
          <circle cx={56} cy={110} r={30} fill={C.gold} />
          <circle cx={56} cy={110} r={22} fill="none" stroke={C.maroonDeep} strokeWidth={1} opacity={0.5} />
          <circle cx={56} cy={110} r={5} fill={C.maroonDeep} opacity={0.6} />
          <circle cx={164} cy={126} r={15} fill={C.gold} />
          <path d="M204 104q14-4 16 8q0 8-8 8q-6-1-4-7" fill="none" stroke={C.gold} strokeWidth={4} strokeLinecap="round" />
          <g stroke={C.champagne} strokeWidth={0.7}>
            <path d="M40 106H206M40 108.5H206M40 111H206M40 113.5H206" />
          </g>
          <g stroke={C.champagne} strokeWidth={1.4}>
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M${92 + i * 9} 103v11`} />
            ))}
          </g>
          <g fill={C.champagne}>
            <rect x={186} y={96} width={3} height={8} />
            <rect x={194} y={96} width={3} height={8} />
            <rect x={186} y={113} width={3} height={8} />
            <rect x={194} y={113} width={3} height={8} />
          </g>
        </g>
        {/* mridangam */}
        <g transform="translate(182 150) rotate(-8)">
          <path d="M-34 -12Q0 -24 34 -10V10Q0 24 -34 12Z" fill={C.terracotta} />
          <ellipse cx={-34} cy={0} rx={5} ry={12} fill={C.parchment} />
          <ellipse cx={34} cy={0} rx={4} ry={10} fill={C.parchment} />
          <g stroke={C.champagne} strokeWidth={0.8} opacity={0.8}>
            <path d="M-30 -11L28 9M-30 11L28 -9M-12 -17L-12 17M10 -17L10 17" />
          </g>
        </g>
        <Sparkle x={34} y={86} r={5} />
        <Sparkle x={212} y={84} r={4} />
      </>
    ),
  },
  muhuratham: {
    ground: C.maroon,
    ink: "light",
    art: (
      <>
        {/* mango-leaf toran */}
        <path d="M8 12H232" stroke={C.gold} strokeWidth={1.4} />
        {Array.from({ length: 15 }, (_, i) => (
          <g key={i}>
            <path d={`M${16 + i * 15} 12q7 14 0 ${i % 2 ? 24 : 30}q-7-${i % 2 ? 10 : 16} 0-${i % 2 ? 24 : 30}Z`} fill={i % 2 ? C.leaf : C.forest} stroke={C.leaf} strokeWidth={0.5} />
          </g>
        ))}
        {[8, 232].map((mx) => (
          <Marigold key={mx} x={mx} y={12} r={7} />
        ))}
        {/* kalasha: pot, mango leaves, coconut */}
        <g>
          {[-48, -24, 0, 24, 48].map((a) => (
            <path key={a} d="M120 96c6-14 6-28 0-40c-6 12-6 26 0 40Z" fill={a % 48 ? C.leaf : "#4C6A3E"} transform={`rotate(${a} 120 100)`} />
          ))}
          <path d="M106 86q14-34 28 0q-14 12-28 0Z" fill={C.earth} />
          <path d="M120 58v-8" stroke={C.earth} strokeWidth={2} strokeLinecap="round" />
          <path d="M104 96h32v6q22 8 22 30q0 26-38 28q-38-2-38-28q0-22 22-30Z" fill={C.gold} />
          <path d="M104 99h32" stroke={C.champagne} strokeWidth={1.2} />
          <path d="M86 126q34 12 68 0M90 142q30 10 60 0" fill="none" stroke={C.champagne} strokeWidth={1} opacity={0.8} />
          <path d="M120 112l5 7l-5 7l-5-7Z" fill={C.maroon} />
          <rect x={100} y={160} width={40} height={5} rx={2} fill={C.goldDeep} />
        </g>
        {/* lamps */}
        {[40, 200].map((lx) => (
          <g key={lx} transform={`translate(${lx} 0)`}>
            <path className="flame" d="M0 78c6 8 6 15 0 20c-6-5-6-12 0-20Z" fill={C.champagne} />
            <path d="M-17 102h34q-3 9-14 10h-6q-11-1-14-10Z" fill={C.gold} />
            <rect x={-2.5} y={112} width={5} height={36} fill={C.gold} />
            <ellipse cx={0} cy={126} rx={6} ry={3.5} fill={C.gold} />
            <path d="M-16 165q2-16 16-17q14 1 16 17Z" fill={C.gold} />
          </g>
        ))}
        <Flower x={72} y={166} r={6} />
        <Flower x={168} y={166} r={6} />
      </>
    ),
  },
  reception: {
    ground: "#F3E0BC",
    ink: "dark",
    art: (
      <>
        {/* two wedding garlands */}
        {[0, 1].map((g) => {
          const cx = g ? 148 : 92;
          const pts = Array.from({ length: 19 }, (_, i) => {
            const t = (i / 18) * Math.PI;
            return [cx - 46 * Math.cos(t), 20 + 96 * Math.sin(t)] as const;
          });
          return (
            <g key={g}>
              {pts.map(([px, py], i) =>
                i % 3 === 1 ? (
                  <circle key={i} cx={px} cy={py} r={6} fill={g ? C.burgundy : C.maroon} />
                ) : (
                  <Flower key={i} x={px} y={py} r={7.5} fill={C.ivory} center={C.gold} />
                ),
              )}
              <path d={`M${cx} 122v14`} stroke={C.goldDeep} strokeWidth={1.4} />
              <path d={`M${cx - 7} 136h14l-3 14h-8Z`} fill={C.gold} stroke={C.goldDeep} strokeWidth={0.8} />
              <circle cx={cx} cy={154} r={3} fill={C.maroon} />
            </g>
          );
        })}
        <Sparkle x={26} y={56} r={8} fill={C.goldDeep} />
        <Sparkle x={214} y={52} r={8} fill={C.goldDeep} />
        <Sparkle x={36} y={130} r={5} fill={C.goldDeep} />
        <Sparkle x={206} y={134} r={5} fill={C.goldDeep} />
        <Sparkle x={120} y={166} r={5} fill={C.goldDeep} />
      </>
    ),
  },
};

export function eventGround(id: EventId) {
  return { ground: eventArt[id].ground, ink: eventArt[id].ink };
}

export function EventArt({ id, className = "" }: { id: EventId; className?: string }) {
  return (
    <svg viewBox="0 0 240 180" className={className} aria-hidden="true">
      {eventArt[id].art}
    </svg>
  );
}
