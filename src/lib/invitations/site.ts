/**
 * Invitation website content stored on the design (`invitation_designs.site`). Everything here is
 * shown to invited guests, so it is validated strictly on the server before saving.
 */
import { z } from "zod";

export type StoryMoment = { title: string; text: string; when: string };
export type Faq = { question: string; answer: string };
/** A "for your guests" card: where to stay, how to get there, who to call. */
export type InfoCard = { title: string; text: string; phone: string };
export type SectionTitles = { story: string; info: string; faq: string; blessings: string };
export const TEMPLATES = [
  { id: "classic", name: "Classic", description: "Clean cards on your theme colour. Works with every theme." },
  { id: "mantapa", name: "Kalyana Mantapa", description: "A wedding hall: banana-stem pillars and a mango-leaf thoranam frame the page, sections arched like a mantapa." },
  { id: "kacheri", name: "Kacheri", description: "Your wedding as a Carnatic concert programme: numbered items, fine rules and a veena line." },
] as const;
export type TemplateId = typeof TEMPLATES[number]["id"];
export const OPENING_STYLES = [
  { id: "envelope", name: "Envelope", description: "An envelope with your seal; guests tap to open it." },
  { id: "letter", name: "Pull-out letter", description: "An invitation card rises out of its sleeve." },
  { id: "doors", name: "Temple doors", description: "Carved doors with brass studs swing open." },
] as const;
export type OpeningStyle = typeof OPENING_STYLES[number]["id"];
export const EFFECTS = [
  { id: "petals", name: "Jasmine and marigold petals" },
  { id: "confetti", name: "Confetti" },
  { id: "none", name: "No effect" },
] as const;
export type CelebrationEffect = typeof EFFECTS[number]["id"];

export type InvitationSite = {
  template: TemplateId;
  opening_style: OpeningStyle;
  /** Plays when a guest opens the invitation and after they reply yes. Skipped for reduced motion. */
  effect: CelebrationEffect;
  opening_animation: boolean;
  countdown: boolean;
  blessings_enabled: boolean;
  livestream_url: string | null;
  story: StoryMoment[];
  faqs: Faq[];
  /** Dress-code colour palette per function id, e.g. ["#e9b44c", "#7d1747"]. */
  palettes: Record<string, string[]>;
  /** A line above the invitation, e.g. "|| Shree Ganeshaya Namah ||". */
  blessing_header: string;
  /** The parents' line under each partner's name, in the couple's own words (S/o, D/o, grandchild of …). */
  parents: { one: string; two: string };
  info_cards: InfoCard[];
  /** "With best compliments from" and the family names that close the invitation. */
  closing: { title: string; names: string[] };
  hashtag: string;
  /** Instagram handles without the @. */
  instagram: string[];
  /** Wording on the opening screen; blank uses the built-in text in the guest's language. */
  reveal: { title: string; hint: string };
  /** Section headings; blank uses the built-in heading in the guest's language. */
  titles: SectionTitles;
};

/** Common blessing lines; the couple can also write their own. */
export const BLESSING_PRESETS = ["|| Shree Ganeshaya Namah ||", "॥ ಶ್ರೀ ಗಣೇಶಾಯ ನಮಃ ॥", "॥ श्री गणेशाय नमः ॥", "|| Om ||"] as const;

export const EMPTY_SITE: InvitationSite = {
  template: "classic", opening_style: "envelope", effect: "petals",
  opening_animation: true, countdown: true, blessings_enabled: false, livestream_url: null, story: [], faqs: [], palettes: {},
  blessing_header: "", parents: { one: "", two: "" }, info_cards: [], closing: { title: "", names: [] }, hashtag: "", instagram: [],
  reveal: { title: "", hint: "" }, titles: { story: "", info: "", faq: "", blessings: "" },
};

const text = (max: number) => z.string().trim().max(max);
const siteSchema = z.object({
  template: z.enum(TEMPLATES.map((item) => item.id) as [TemplateId, ...TemplateId[]]).catch("classic").default("classic"),
  opening_style: z.enum(OPENING_STYLES.map((item) => item.id) as [OpeningStyle, ...OpeningStyle[]]).catch("envelope").default("envelope"),
  effect: z.enum(EFFECTS.map((item) => item.id) as [CelebrationEffect, ...CelebrationEffect[]]).catch("petals").default("petals"),
  opening_animation: z.boolean().default(true),
  countdown: z.boolean().default(true),
  blessings_enabled: z.boolean().default(false),
  livestream_url: z.union([z.literal(""), z.null(), z.url({ protocol: /^https$/, message: "The livestream link must start with https://" })]).transform((value) => value || null).default(null),
  story: z.array(z.object({ title: text(80).min(1, "Give each story moment a title."), text: text(600), when: text(40) })).max(8, "Up to 8 story moments.").default([]),
  faqs: z.array(z.object({ question: text(160).min(1, "Write each question."), answer: text(800).min(1, "Answer each question.") })).max(12, "Up to 12 questions.").default([]),
  palettes: z.record(z.uuid(), z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use colours like #E9B44C.")).max(5)).default({}),
  blessing_header: text(80).default(""),
  parents: z.object({ one: text(200).default(""), two: text(200).default("") }).default({ one: "", two: "" }),
  info_cards: z.array(z.object({
    title: text(60).min(1, "Give each guest information card a title."), text: text(500).default(""),
    phone: text(30).regex(/^[+0-9 ()-]*$/, "Phone numbers may only use digits, spaces, +, ( ) and -.").default(""),
  })).max(6, "Up to 6 guest information cards.").default([]),
  closing: z.object({ title: text(80).default(""), names: z.array(text(80).min(1, "Remove empty family names.")).max(16, "Up to 16 family names.").default([]) }).default({ title: "", names: [] }),
  hashtag: text(40).regex(/^(#[\p{L}\p{M}\p{N}_]+)?$/u, "Write the hashtag as one word starting with #, e.g. #RaviWedsMeera.").default(""),
  instagram: z.array(text(31).transform((value) => value.replace(/^@/, "")).pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, "Instagram handles use letters, numbers, dots and underscores."))).max(3, "Up to 3 Instagram handles.").default([]),
  reveal: z.object({ title: text(80).default(""), hint: text(80).default("") }).default({ title: "", hint: "" }),
  titles: z.object({ story: text(60).default(""), info: text(60).default(""), faq: text(60).default(""), blessings: text(60).default("") }).default({ story: "", info: "", faq: "", blessings: "" }),
});

/** Validates submitted website content. Unknown fields are dropped; invalid content throws a readable error. */
export function parseSite(input: unknown): InvitationSite {
  const result = siteSchema.safeParse(input ?? {});
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Check the website content.");
  // The database keeps the whole website under 64 KB; stop a little earlier with a clear message.
  if (new TextEncoder().encode(JSON.stringify(result.data)).length > 60_000) throw new Error("The website content is too long. Shorten the story, FAQ or guest information.");
  return result.data;
}

/** Lenient read for display: anything malformed falls back to the defaults instead of breaking the page. */
export function readSite(input: unknown): InvitationSite {
  const result = siteSchema.safeParse(input ?? {});
  return result.success ? result.data : EMPTY_SITE;
}

export type CountdownTarget = { name: string; startsAt: Date };

/** The next function that has not started yet, from guest-visible dates and times in the wedding timezone. */
export function nextFunctionStart(functions: Array<{ name: string; startsAt: string | null }>, now: Date): CountdownTarget | null {
  const upcoming = functions.filter((fn) => fn.startsAt && new Date(fn.startsAt) > now).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  return upcoming[0] ? { name: upcoming[0].name, startsAt: new Date(upcoming[0].startsAt!) } : null;
}

export function countdownParts(target: Date, now: Date): { days: number; hours: number; minutes: number } | null {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return null;
  return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000), minutes: Math.floor((ms % 3_600_000) / 60_000) };
}

/** "Live now" window: from 30 minutes before a function starts until 6 hours after. */
export function isLiveWindow(startsAt: Date | null, now: Date) {
  if (!startsAt) return false;
  const delta = now.getTime() - startsAt.getTime();
  return delta >= -30 * 60_000 && delta <= 6 * 3_600_000;
}
