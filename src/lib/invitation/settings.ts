/**
 * The invitation's wording, edited in Guests → Invitation and stored as a draft and a published
 * version. Families see the published version; the code file (`src/config/invitation.ts`) is only
 * the starting point and the fallback. Events stay in Plan → Functions.
 *
 * Pure: used by the server (checking and saving) and the browser (the edit form).
 */
import { z } from "zod";
import { EVENT_IDS, invitationConfig, type InvitationConfig } from "@/config/invitation";

/** The two tracks shipped with the app. Uploading other music is not supported yet. */
export const TRACKS = {
  "carnatic-melody": { title: "A Sacred Carnatic Wedding Melody", src: "/audio/wedding-music.mp3", credit: "NirvanaSutra Music" },
  hamsadhwani: { title: "Mangala Arambha (Raga Hamsadhwani, veena)", src: "/audio/hamsadhwani.mp3", credit: null },
} as const;
export type TrackId = keyof typeof TRACKS;
const TRACK_IDS = Object.keys(TRACKS) as [TrackId, ...TrackId[]];

export const EVENT_LABELS: Record<(typeof EVENT_IDS)[number], string> = { engagement: "Engagement", haldi: "Haldi", mehendi: "Mehendi", sangeet: "Sangeet", muhuratham: "Muhurtham (the wedding)", reception: "Reception" };

const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim();
const line = (max: number, label: string) => z.string().transform(clean).pipe(z.string().min(1, `${label} is needed.`).max(max, `${label} can be up to ${max} characters.`));
const optional = (max: number, label: string) => z.string().nullable().transform((value) => (value === null ? null : clean(value) || null)).pipe(z.string().max(max, `${label} can be up to ${max} characters.`).nullable());

export const settingsSchema = z.object({
  brideName: line(60, "The bride's name"),
  groomName: line(60, "The groom's name"),
  families: z.object({
    brideFullName: optional(120, "The bride's full name"),
    groomFullName: optional(120, "The groom's full name"),
    brideParents: optional(300, "The bride's parents line"),
    groomParents: optional(300, "The groom's parents line"),
    brideGrandparents: z.array(line(300, "Each grandparents line")).max(4, "Up to 4 grandparents lines.").nullable().transform((list) => (list?.length ? list : null)),
    groomGrandparents: z.array(line(300, "Each grandparents line")).max(4, "Up to 4 grandparents lines.").nullable().transform((list) => (list?.length ? list : null)),
  }),
  weddingTime: z.string().nullable().transform((value) => value || null).pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:30.").nullable()),
  location: line(120, "The place"),
  eventDescriptions: z.object(Object.fromEntries(EVENT_IDS.map((id) => [id, line(400, `The ${EVENT_LABELS[id]} note`)])) as Record<(typeof EVENT_IDS)[number], ReturnType<typeof line>>),
  goodToKnow: z.object({
    weather: optional(400, "Weather"),
    dressCode: optional(400, "What to wear"),
    hashtag: optional(61, "The hashtag").pipe(z.string().regex(/^#?[A-Za-z0-9_]{2,60}$/, "Use letters, numbers and _ only, like #SweekrutiWedsSiddhanth.").nullable()),
    parking: optional(400, "Parking"),
    driversAndStaff: optional(400, "Drivers and staff"),
  }),
  contact: z.object({
    name: optional(80, "The contact name"),
    phone: optional(20, "The phone number").pipe(z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Use digits, spaces and + only, like +91 98765 43210.").nullable()),
    email: optional(120, "The email").pipe(z.email("Use an email address like name@example.com.").nullable()),
  }),
  respondBy: z.string().nullable().transform((value) => value || null).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.").nullable()),
  musicId: z.enum(TRACK_IDS, "Choose one of the tracks."),
});
export type InvitationSettings = z.output<typeof settingsSchema>;

/** The wording as the code file has it today: the first draft, and the fallback. */
export function settingsFromConfig(config: InvitationConfig = invitationConfig): InvitationSettings {
  const musicId = (Object.entries(TRACKS).find(([, track]) => track.src === config.music.src)?.[0] ?? "carnatic-melody") as TrackId;
  return {
    brideName: config.brideName, groomName: config.groomName, families: { ...config.families }, weddingTime: config.weddingTime, location: config.location,
    eventDescriptions: { ...config.eventDescriptions }, goodToKnow: { ...config.goodToKnow }, contact: { ...config.contact }, respondBy: config.rsvp.respondBy, musicId,
  };
}

/** What the invitation components read. */
export function configFromSettings(settings: InvitationSettings): InvitationConfig {
  return {
    brideName: settings.brideName, groomName: settings.groomName, families: settings.families, weddingTime: settings.weddingTime, location: settings.location,
    eventDescriptions: settings.eventDescriptions, goodToKnow: settings.goodToKnow, contact: settings.contact, rsvp: { respondBy: settings.respondBy }, music: { ...TRACKS[settings.musicId] },
  };
}

/** Stored wording → what families see. Missing or unreadable wording falls back to the code file. */
export function resolveConfig(stored: unknown): InvitationConfig {
  if (!stored) return invitationConfig;
  const parsed = settingsSchema.safeParse(stored);
  return parsed.success ? configFromSettings(parsed.data) : invitationConfig;
}

export const coupleNamesOf = (config: InvitationConfig) => `${config.brideName} & ${config.groomName}`;

/** The edit form's field names (dotted paths) → the settings, or a message for each field. */
export function settingsFromForm(form: FormData): { ok: true; settings: InvitationSettings } | { ok: false; errors: Record<string, string> } {
  const text = (name: string) => { const value = form.get(name); return typeof value === "string" ? value : ""; };
  const nullable = (name: string) => text(name).trim() || null;
  const lines = (name: string) => text(name).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const raw = {
    brideName: text("brideName"), groomName: text("groomName"),
    families: {
      brideFullName: nullable("families.brideFullName"), groomFullName: nullable("families.groomFullName"),
      brideParents: nullable("families.brideParents"), groomParents: nullable("families.groomParents"),
      brideGrandparents: lines("families.brideGrandparents"), groomGrandparents: lines("families.groomGrandparents"),
    },
    weddingTime: nullable("weddingTime"), location: text("location"),
    eventDescriptions: Object.fromEntries(EVENT_IDS.map((id) => [id, text(`eventDescriptions.${id}`)])),
    goodToKnow: { weather: nullable("goodToKnow.weather"), dressCode: nullable("goodToKnow.dressCode"), hashtag: nullable("goodToKnow.hashtag"), parking: nullable("goodToKnow.parking"), driversAndStaff: nullable("goodToKnow.driversAndStaff") },
    contact: { name: nullable("contact.name"), phone: nullable("contact.phone"), email: nullable("contact.email") },
    respondBy: nullable("respondBy"), musicId: text("musicId"),
  };
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return { ok: true, settings: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    // A grandparents list's problems belong to its one text box.
    const key = issue.path.filter((part) => typeof part === "string").join(".");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** Whether two stored versions say the same thing (the database may reorder keys, so compare checked copies). */
export function sameSettings(a: unknown, b: unknown) {
  const read = (value: unknown) => { const parsed = settingsSchema.safeParse(value); return parsed.success ? JSON.stringify(parsed.data) : JSON.stringify(value ?? null); };
  return read(a) === read(b);
}
