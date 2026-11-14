/**
 * The invitation guests see at /i/<their code>, ported from the couple's invitation site.
 *
 * Names, family lines, notes and music live here. The events (dates, times, venues, map links,
 * dress codes) come from Plan → Functions, so they are set in one place only. Each family sees the
 * functions it is invited to on the Guest desk.
 *
 * Leave a value as null until it is known; guests then see "to be announced" or nothing.
 */
import { z } from "zod";

/** The six illustrated events. Functions are matched to one by their type or name. */
export const EVENT_IDS = ["engagement", "haldi", "mehendi", "sangeet", "muhuratham", "reception"] as const;
export type EventId = (typeof EVENT_IDS)[number];

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use YYYY-MM-DD");
const text = z.string().trim().min(1);

const configSchema = z.object({
  brideName: text,
  groomName: text,
  families: z.object({
    brideFullName: text.nullable(),
    groomFullName: text.nullable(),
    brideParents: text.nullable(),
    groomParents: text.nullable(),
    brideGrandparents: z.array(text).min(1).nullable(),
    groomGrandparents: z.array(text).min(1).nullable(),
  }),
  /** Time the countdown runs to on the wedding day (the date is the wedding date in Settings). */
  weddingTime: clockTime.nullable(),
  location: text,
  /** Shown under an event when its function has no description of its own. */
  eventDescriptions: z.record(z.enum(EVENT_IDS), text),
  goodToKnow: z.object({
    weather: text.nullable(),
    dressCode: text.nullable(),
    hashtag: z.string().trim().regex(/^#?[A-Za-z0-9_]{2,60}$/, "Letters, numbers and _ only").nullable(),
    parking: text.nullable(),
    driversAndStaff: text.nullable(),
  }),
  contact: z.object({ name: text.nullable(), phone: text.nullable(), email: z.email().nullable() }),
  rsvp: z.object({ respondBy: isoDate.nullable() }),
  music: z.object({ title: text, src: z.string().startsWith("/"), credit: text.nullable() }),
});

export type InvitationConfig = z.output<typeof configSchema>;
export type Families = InvitationConfig["families"];
export type Track = InvitationConfig["music"];

const details: z.input<typeof configSchema> = {
  brideName: "Sweekruti",
  groomName: "Siddhanth",
  families: {
    brideFullName: null,
    groomFullName: null,
    brideParents: "Shri Krishna Gambhir and Smt. Vanita Gambhir",
    groomParents: "Shri Chandrahas Shetty and Smt. Ramita Shetty",
    brideGrandparents: null,
    groomGrandparents: ["Lt. Shri Vasu Shetty, Mullagudde, Palli and Lt. Smt. Gulabi Shetty, Mallibettu, Ninjoor", "Lt. Shri Vasu Shetty and Smt. Sakubai Shetty, Punchilkat, Kalathoor"],
  },
  weddingTime: null,
  location: "Mangaluru, Karnataka, India",
  eventDescriptions: {
    engagement: "Rings, blessings and the first promise, with both our families gathered around us.",
    haldi: "Turmeric, marigolds and a good deal of laughter. Wear something you don't mind turning yellow.",
    mehendi: "An unhurried afternoon of henna, songs and stories.",
    sangeet: "An evening of music and dance from both sides of the family.",
    muhuratham: "The wedding ceremony, at the auspicious hour, in the presence of our elders.",
    reception: "Dinner, good company and a chance for us to thank you in person.",
  },
  goodToKnow: { weather: null, dressCode: null, hashtag: null, parking: null, driversAndStaff: null },
  contact: { name: null, phone: null, email: null },
  rsvp: { respondBy: null },
  // The same track as on the invitation site. It plays only when a guest chooses "Open with music"
  // or presses play, and loops until paused. The track belongs to NirvanaSutra Music ("All rights
  // reserved"); confirm their permission. If they say no, switch to the original piece made for the
  // site: { title: "Mangala Arambha (Raga Hamsadhwani, veena)", src: "/audio/hamsadhwani.mp3", credit: null }
  music: { title: "A Sacred Carnatic Wedding Melody", src: "/audio/wedding-music.mp3", credit: "NirvanaSutra Music" },
};

function load(): InvitationConfig {
  const parsed = configSchema.safeParse(details);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  • ${issue.path.join(".") || "(config)"}: ${issue.message}`);
    throw new Error(`src/config/invitation.ts has a problem:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export const invitationConfig = load();
export const coupleNames = `${invitationConfig.brideName} & ${invitationConfig.groomName}`;

/** Which illustration a function gets, from its type or name; muhuratham for the wedding itself. */
export function eventArtFor(type: string, name: string): EventId {
  const words = `${type} ${name}`.toLowerCase();
  if (/engage|nischay|ring/.test(words)) return "engagement";
  if (/haldi|arishina/.test(words)) return "haldi";
  if (/mehend|mehndi|henna/.test(words)) return "mehendi";
  if (/sangeet|music|dance/.test(words)) return "sangeet";
  if (/reception|dinner|party/.test(words)) return "reception";
  return "muhuratham";
}
