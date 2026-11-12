/**
 * Adding a family in one step: the family name, then one person per line.
 * Kept free of server imports so it can be unit-tested.
 */
import { z } from "zod";

export const MAX_FAMILY_MEMBERS = 30;

/** One name per line; blank lines and repeats (ignoring case and spacing) are dropped. */
export function parseFamilyMembers(text: string): { names: string[]; error: string | null } {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (!names.length) return { names, error: "Add at least one person, one name per line." };
  if (names.length > MAX_FAMILY_MEMBERS) return { names, error: `Add up to ${MAX_FAMILY_MEMBERS} people at a time.` };
  const tooLong = names.find((name) => name.length > 180);
  if (tooLong) return { names, error: `“${tooLong.slice(0, 40)}…” is too long for a name.` };
  return { names, error: null };
}

export const familyInput = z.object({
  name: z.string().trim().min(1, "Give the family a name, for example “Rao family”.").max(180),
  familySide: z.enum(["couple_one", "couple_two", "shared", "unknown"]),
  contactPhone: z.string().trim().max(80),
  members: z.string().max(20000),
  functionIds: z.array(z.uuid()).max(50),
});
export type FamilyInput = z.infer<typeof familyInput>;

/** Every person invited to every chosen function, with no plus-one. */
export function familyInvitations(guestIds: string[], functionIds: string[]) {
  return guestIds.flatMap((guestId) => functionIds.map((functionId) => ({ guestId, functionId, invited: true, plusOneAllowed: false })));
}
