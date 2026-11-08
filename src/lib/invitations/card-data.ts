import type { InvitationCardProps } from "@/components/invitation-card";
import { fillText, formatFunctionDate, resolveTexts, type LanguageCode, type TextOverrides, type ThemeId } from "@/lib/invitations/content";

/** The Save the Date part of a design's website content, or null for a full invitation. */
export function saveTheDateOf(site: { kind: string; save_the_date: { date: string; city: string } }) {
  return site.kind === "save_the_date" && site.save_the_date.date ? site.save_the_date : null;
}

export type CardFunctionInput = { name: string; function_date: string | null; start_time: string | null; venue_name: string | null };

/** Everything the card needs for one invited person, in their household's chosen language. */
export function buildCardProps(input: {
  theme: ThemeId; accent: string | null; overrides: TextOverrides; language: LanguageCode; couple: string; greetingName: string; functions: CardFunctionInput[];
  photoUrl?: string | null; showMonogram?: boolean;
  /** Save the Date designs: the wedding date (YYYY-MM-DD) and place instead of a function list. */
  saveTheDate?: { date: string; city: string } | null;
}): InvitationCardProps {
  const kind = input.saveTheDate ? "save_the_date" : "invitation";
  const texts = resolveTexts(input.language, input.overrides, true, kind);
  const values = { name: input.greetingName, couple: input.couple };
  const sorted = [...input.functions].sort((a, b) => `${a.function_date ?? "9999"}${a.start_time ?? ""}`.localeCompare(`${b.function_date ?? "9999"}${b.start_time ?? ""}`));
  return {
    theme: input.theme, accent: input.accent, lang: input.language === "tcy" ? "tcy" : input.language,
    greeting: fillText(texts.greeting, values), heading: fillText(texts.heading, values), couple: input.couple, body: fillText(texts.body, values),
    functionsHeading: fillText(texts.functionsHeading, values), rsvp: fillText(texts.rsvp, values), closing: fillText(texts.closing, values),
    functions: sorted.map((fn) => ({ name: fn.name, when: formatFunctionDate(fn.function_date, fn.start_time, input.language), venue: fn.venue_name })),
    photoUrl: input.photoUrl ?? null,
    monogram: input.showMonogram === false ? null : monogramFor(input.couple),
    saveTheDate: input.saveTheDate ? { date: formatFunctionDate(input.saveTheDate.date, null, input.language), city: input.saveTheDate.city } : null,
  };
}

/** "Priya & Arjun" → "P · A". Uses the first letter (grapheme) of each name; null when there are none. */
export function monogramFor(couple: string): string | null {
  const names = couple.split(/\s*(?:&|and|\+)\s*/i).map((name) => name.trim()).filter(Boolean).slice(0, 2);
  const initials = names.map((name) => typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name), (part) => part.segment)[0]!
    : Array.from(name)[0]!).map((letter) => letter.toLocaleUpperCase());
  return initials.length ? initials.join(" · ") : null;
}

/** Functions a household is invited to: any member's active invitation counts, each function once. */
export function householdFunctions<T extends { id: string }>(householdId: string, guests: Array<{ id: string; household_id: string | null }>, invitations: Array<{ guest_id: string; function_id: string }>, functions: T[]): T[] {
  const members = new Set(guests.filter((guest) => guest.household_id === householdId).map((guest) => guest.id));
  const ids = new Set(invitations.filter((row) => members.has(row.guest_id)).map((row) => row.function_id));
  return functions.filter((fn) => ids.has(fn.id));
}
