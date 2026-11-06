import type { InvitationCardProps } from "@/components/invitation-card";
import { fillText, formatFunctionDate, resolveTexts, type LanguageCode, type TextOverrides, type ThemeId } from "@/lib/invitations/content";

export type CardFunctionInput = { name: string; function_date: string | null; start_time: string | null; venue_name: string | null };

/** Everything the card needs for one household, in that household's language. */
export function buildCardProps(input: {
  theme: ThemeId; accent: string | null; overrides: TextOverrides; language: LanguageCode; couple: string; greetingName: string; functions: CardFunctionInput[];
}): InvitationCardProps {
  const texts = resolveTexts(input.language, input.overrides);
  const values = { name: input.greetingName, couple: input.couple };
  const sorted = [...input.functions].sort((a, b) => `${a.function_date ?? "9999"}${a.start_time ?? ""}`.localeCompare(`${b.function_date ?? "9999"}${b.start_time ?? ""}`));
  return {
    theme: input.theme, accent: input.accent, lang: input.language === "tcy" ? "tcy" : input.language,
    greeting: fillText(texts.greeting, values), heading: fillText(texts.heading, values), couple: input.couple, body: fillText(texts.body, values),
    functionsHeading: fillText(texts.functionsHeading, values), rsvp: fillText(texts.rsvp, values), closing: fillText(texts.closing, values),
    functions: sorted.map((fn) => ({ name: fn.name, when: formatFunctionDate(fn.function_date, fn.start_time, input.language), venue: fn.venue_name })),
  };
}

/** Functions a household is invited to: any member's active invitation counts, each function once. */
export function householdFunctions<T extends { id: string }>(householdId: string, guests: Array<{ id: string; household_id: string | null }>, invitations: Array<{ guest_id: string; function_id: string }>, functions: T[]): T[] {
  const members = new Set(guests.filter((guest) => guest.household_id === householdId).map((guest) => guest.id));
  const ids = new Set(invitations.filter((row) => members.has(row.guest_id)).map((row) => row.function_id));
  return functions.filter((fn) => ids.has(fn.id));
}
