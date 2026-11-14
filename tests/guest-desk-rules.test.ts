/** Simple guest desk: the paste parser, family reply status, ordering, headcounts and family links. */
import { describe, expect, it } from "vitest";
import { databaseProblem, familyNameKey, parseFamilyLines, problemText, tidyPhone } from "@/lib/planning/family-paste";
import { deskTotals, familyLead, familyProxies, familyRows, headcounts, replyLabel, sortFamilies, type DeskGuest, type DeskHousehold, type DeskInvitation, type DeskLink, type DeskReply } from "@/lib/planning/guest-desk";
import { activeAreaTab, AREAS, NAV_GROUPS } from "@/lib/navigation";
import { reminderMessage, REMINDERS } from "@/lib/invitations/reminder";
import { PORTAL_STRINGS } from "@/lib/guest-portal/i18n";

describe("pasting families", () => {
  it("reads name, phone and number of guests, ignoring blank lines", () => {
    const { families, problems } = parseFamilyLines("Rao family, +91 98765 43210, 4\n\n  Pai   family , , 2 \nKamath family\r\nBhat family, 3");
    expect(problems).toEqual([]);
    expect(families).toEqual([
      { line: 1, name: "Rao family", phone: "+91 98765 43210", size: 4 },
      { line: 3, name: "Pai family", phone: "", size: 2 },
      { line: 4, name: "Kamath family", phone: "", size: 1 },
      { line: 5, name: "Bhat family", phone: "", size: 3 },
    ]);
  });

  it("adds +91 to bare Indian mobiles and keeps other numbers as typed", () => {
    expect(tidyPhone("98765 43210")).toBe("+91 98765 43210");
    expect(tidyPhone("98765-43210")).toBe("+91 98765 43210");
    expect(tidyPhone("00353871234567")).toBe("+353871234567");
    expect(tidyPhone("+353 87 123 4567")).toBe("+353 87 123 4567");
    expect(tidyPhone("0824 222 3333")).toBe("0824 222 3333");
    expect(parseFamilyLines("Rao family, 9876543210, 2").families[0]!.phone).toBe("+91 98765 43210");
  });

  it("lists every problem with its line number and adds nothing", () => {
    const { problems } = parseFamilyLines([
      "Rao family, +91 98765 43210, 4",
      "Pai family, , 21",
      "Shenoy, Ravi and Asha, +91 90000 00000, 2",
      ", +91 98765 43210",
      "Kini family, call me, 2",
      "Nayak family, , two",
      "rao   FAMILY, , 1",
      `${"x".repeat(130)}, , 1`,
    ].join("\n"));
    expect(problems.map(problemText)).toEqual([
      "Line 2 (Pai family): number of guests should be 1 to 20.",
      "Line 3 (Shenoy): use at most two commas (name, phone, number of guests). Leave commas out of the name.",
      "Line 4: add the family's name first, for example “Rao family”.",
      "Line 5 (Kini family): that phone number doesn't look right. Use digits, starting with + and the country code, for example +91 98765 43210.",
      "Line 6 (Nayak family): number of guests should be 1 to 20.",
      "Line 7 (rao FAMILY): this family is already on line 1.",
      `Line 8 (${"x".repeat(30)}…): keep the name under 120 characters.`,
    ]);
  });

  it("asks for at least one family, and at most 100", () => {
    expect(parseFamilyLines(" \n\n").problems.map(problemText)).toEqual(["Line 1: paste at least one family, one per line."]);
    const many = Array.from({ length: 101 }, (_, i) => `Family ${i + 1}`).join("\n");
    expect(parseFamilyLines(many).problems.map(problemText)).toEqual(["Line 101: add up to 100 families at a time. Split the rest into another paste."]);
  });

  it("compares names like the database does, and explains its refusals", () => {
    expect(familyNameKey("  Rao   Family ")).toBe(familyNameKey("rao family"));
    expect(databaseProblem("exists")).toMatch(/already on your list/);
    expect(databaseProblem("repeat")).toMatch(/earlier line/);
  });
});

const household = (id: string, name: string): DeskHousehold => ({ id, name, contact_name: name, contact_phone: "", preferred_language: "en" });
const guest = (id: string, householdId: string, created = "2026-11-01T00:00:00Z", name = id): DeskGuest => ({ id, household_id: householdId, full_name: name, phone: "", is_placeholder: true, created_at: created });
const invite = (id: string, guestId: string, functionId = "f1", status = "invited"): DeskInvitation => ({ id, guest_id: guestId, function_id: functionId, status });

describe("family reply status", () => {
  const households = [household("h1", "Rao family"), household("h2", "Pai family"), household("h3", "Bhat family"), household("h4", "Alva family")];
  const guests = [guest("r1", "h1"), guest("r2", "h1"), guest("r3", "h1"), guest("r4", "h1"), guest("p1", "h2"), guest("b1", "h3"), guest("a1", "h4")];
  const invitations = [
    invite("i-r1a", "r1"), invite("i-r1b", "r1", "f2"), invite("i-r2", "r2"), invite("i-r3", "r3"), invite("i-r4", "r4"),
    invite("i-p1", "p1"), invite("i-b1", "b1"), invite("i-a1", "a1", "f1", "withdrawn"),
  ];
  const replies: DeskReply[] = [
    { invitation_id: "i-r1a", response: "yes" }, { invitation_id: "i-r1b", response: "no" }, { invitation_id: "i-r2", response: "yes" },
    { invitation_id: "i-r3", response: "maybe" }, { invitation_id: "i-r4", response: "yes" }, { invitation_id: "i-p1", response: "no" },
  ];
  const rows = familyRows({ households, guests, invitations, replies, links: [], messages: [{ guest_id: "r1", sent_at: "2026-11-02T00:00:00Z", dedupe_key: "invite:d:1:whatsapp:r1" }, { guest_id: "b1", sent_at: "2026-11-03T00:00:00Z", dedupe_key: "remind:b1:2026-11-03" }] });
  const byName = (name: string) => rows.find((row) => row.name === name)!;

  it("says “Accepts, 3 of 4”, “Declines” and “Not yet”", () => {
    expect(replyLabel(byName("Rao family"))).toBe("Accepts, 3 of 4");
    expect(replyLabel(byName("Pai family"))).toBe("Declines");
    expect(replyLabel(byName("Bhat family"))).toBe("Not yet");
    expect(byName("Rao family").invitedAt).toBe("2026-11-02T00:00:00Z");
    expect(byName("Bhat family")).toMatchObject({ remindedAt: "2026-11-03T00:00:00Z", reminders: 1, invitedAt: null });
  });

  it("counts a family as replied only when every invited person answered every function", () => {
    const partial = familyRows({ households: [household("h1", "Rao family")], guests: guests.slice(0, 2), invitations: invitations.slice(0, 3), replies: replies.slice(0, 1), links: [], messages: [] })[0]!;
    expect(partial.state).toBe("not_yet");
    expect(replyLabel(partial)).toBe("Not yet");
    const one = familyRows({ households: [household("h1", "Rao family")], guests: guests.slice(0, 2), invitations: invitations.slice(0, 3), replies: replies.slice(0, 2), links: [], messages: [] })[0]!;
    expect(replyLabel(one)).toBe("Not yet (1 of 2 replied)");
  });

  it("leaves families with nobody invited out of the counts, and lets removed ones be put back", () => {
    const alva = byName("Alva family");
    expect(alva).toMatchObject({ state: "not_invited", canPutBack: true, invitedPeople: 0 });
    const empty = familyRows({ households: [household("h9", "Empty family")], guests: [], invitations: [], replies: [], links: [], messages: [] })[0]!;
    expect(empty).toMatchObject({ state: "not_invited", canPutBack: false, leadId: null });
    expect(deskTotals(rows)).toEqual({ invited: 3, replied: 2, waiting: 1 });
  });

  it("lists not-yet families first, then by name, and not-invited ones last", () => {
    const more = familyRows({ households: [...households, household("h5", "Acharya family")], guests: [...guests, guest("c1", "h5")], invitations: [...invitations, invite("i-c1", "c1")], replies, links: [], messages: [] });
    expect(sortFamilies(more).map((row) => row.name)).toEqual(["Acharya family", "Bhat family", "Pai family", "Rao family", "Alva family"]);
  });

  it("counts yes, maybe, no and waiting per function, by person", () => {
    expect(headcounts([{ id: "f1", name: "Wedding" }, { id: "f2", name: "Reception" }], invitations, replies)).toEqual([
      { id: "f1", name: "Wedding", yes: 3, maybe: 1, no: 1, waiting: 1 },
      { id: "f2", name: "Reception", yes: 0, maybe: 0, no: 1, waiting: 0 },
    ]);
  });
});

describe("one link per family", () => {
  const people = [guest("lead", "h1", "2026-11-01T00:00:00Z", "Rao family"), guest("g2", "h1", "2026-11-01T00:00:01Z"), guest("g3", "h1", "2026-11-01T00:00:02Z")];
  const invitations = people.map((person) => invite(`i-${person.id}`, person.id));
  const link = (guestId: string, created: string, proxies: string[], active = true): DeskLink => ({ guest_id: guestId, household_id: "h1", active, created_at: created, expires_at: "2026-12-01T00:00:00Z", last_opened_at: null, proxy_guest_ids: proxies });

  it("belongs to whoever had the latest link, else the contact person, else the first added", () => {
    expect(familyLead(household("h1", "Rao family"), people, [])!.id).toBe("lead");
    expect(familyLead({ ...household("h1", "Rao family"), contact_name: "" }, [...people].reverse(), [])!.id).toBe("lead");
    expect(familyLead(household("h1", "Rao family"), people, [link("lead", "2026-11-01", []), link("g3", "2026-11-05", [])])!.id).toBe("g3");
  });

  it("keeps answering for the same people when a fresh link replaces the old one", () => {
    expect(familyProxies("lead", people, invitations, [])).toEqual(["g2", "g3"]);
    expect(familyProxies("lead", people, invitations, [link("lead", "2026-11-01", ["g2"], false)])).toEqual(["g2"]);
    // A link made for the lead alone on the Invitations page: the family link covers everyone again.
    expect(familyProxies("lead", people, invitations, [link("lead", "2026-11-01", [])])).toEqual(["g2", "g3"]);
    // Only people still invited.
    expect(familyProxies("lead", people, [invitations[0]!, invitations[1]!, invite("i-g3", "g3", "f1", "withdrawn")], [])).toEqual(["g2"]);
  });

  it("knows whether the lead's current link still works, for reminders", () => {
    const [row] = familyRows({ households: [household("h1", "Rao family")], guests: people, invitations, replies: [], links: [link("lead", "2026-11-01", ["g2", "g3"])], messages: [] });
    expect(row).toMatchObject({ leadId: "lead", linkActive: true, linkExpiresAt: "2026-12-01T00:00:00Z", placeholders: 3 });
    const [expired] = familyRows({ households: [household("h1", "Rao family")], guests: people, invitations, replies: [], links: [link("lead", "2026-11-01", ["g2", "g3"], false)], messages: [] });
    expect(expired!.linkActive).toBe(false);
  });
});

describe("desk wording and navigation", () => {
  it("is first in Guests, which opens it, and highlights only its own tab", () => {
    expect(AREAS.guests[0]).toEqual({ href: "/guests/simple", label: "Guest desk" });
    expect(NAV_GROUPS.find((group) => group.id === "guests")!.links[0]!.href).toBe("/guests/simple");
    expect(activeAreaTab("/guests/simple", AREAS.guests)).toBe("/guests/simple");
    expect(activeAreaTab("/guests", AREAS.guests)).toBe("/guests");
  });

  it("has reminders in every language, with and without a link", () => {
    for (const language of Object.keys(REMINDERS) as Array<keyof typeof REMINDERS>) {
      expect(reminderMessage(language, { name: "Rao family", couple: "A & B", link: "https://x/guest#t" })).toContain("https://x/guest#t");
      const plain = reminderMessage(language, { name: "Rao family", couple: "A & B" });
      expect(plain).toContain("Rao family");
      expect(plain).not.toContain("http");
    }
  });

  it("has the one-tap and naming words in English, Hindi, Kannada and Tulu", () => {
    for (const t of Object.values(PORTAL_STRINGS)) {
      expect(t.allOfUs).toBeTruthy(); expect(t.addName).toBeTruthy(); expect(t.allOfUsSaved(3)).toContain("3");
      expect(t.nameFor("Rao family guest 2")).toContain("Rao family guest 2");
    }
    expect(PORTAL_STRINGS.en.allOfUs).toBe("All of us, to all events");
    expect(new Set(Object.values(PORTAL_STRINGS).map((t) => t.allOfUs)).size).toBe(4);
  });
});
