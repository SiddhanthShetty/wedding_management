/** Family invitations: links, messages, the reply form, the Guest desk's counts and the paste box. */
import { describe, expect, it } from "vitest";
import {
  CODE_PATTERN, databaseFieldMessage, deskTotals, familyRows, functionHeadcounts, inviteLink, inviteMessage, mealsByFunction, newInviteCode, reminderMessage,
  repliesCsv, replyErrors, replyLabel, replySchema, sortFamilies, whatsappLink, withoutLink, type DeskFamily, type DeskReply,
} from "../src/lib/family-invites/rules";
import { databaseProblem, familyNameKey, parseFamilyLines, problemText, tidyPhone } from "../src/lib/planning/family-paste";
import { eventArtFor, invitationConfig } from "../src/config/invitation";
import { familyRecipients } from "../src/lib/data/communications";

describe("family links", () => {
  it("makes 12-character codes from an unambiguous alphabet, evenly", () => {
    for (let i = 0; i < 50; i += 1) expect(newInviteCode()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    // Bytes of 224 and above are skipped so every letter is equally likely.
    let calls = 0;
    const code = newInviteCode(() => { calls += 1; return Uint8Array.from({ length: 16 }, (_, i) => (calls === 1 ? 250 : i)); });
    expect(code).toBe("ABCDEFGHJKLM");
    expect(CODE_PATTERN.test(code)).toBe(true);
    expect(new Set(Array.from({ length: 200 }, () => newInviteCode())).size).toBe(200);
  });

  it("builds the link and the WhatsApp messages", () => {
    const link = inviteLink("https://wedding.example/", "ABCDEFGHJKLM");
    expect(link).toBe("https://wedding.example/i/ABCDEFGHJKLM");
    expect(inviteMessage("Rao family", link, "Sweekruti & Siddhanth")).toContain("Dear Rao family,");
    expect(inviteMessage("Rao family", link, "Sweekruti & Siddhanth")).toContain(link);
    expect(reminderMessage("Rao family", link, "Sweekruti & Siddhanth")).toMatch(/gentle reminder[\s\S]*https:\/\/wedding\.example\/i\/ABCDEFGHJKLM$/);
  });

  it("opens a specific chat only for numbers starting with +, and never stores the link", () => {
    expect(whatsappLink("+91 98765 43210", "Hi & bye")).toEqual({ url: "https://wa.me/919876543210?text=Hi%20%26%20bye", hasNumber: true });
    expect(whatsappLink("98765 43210", "Hi")).toEqual({ url: "https://wa.me/?text=Hi", hasNumber: false });
    expect(withoutLink("Open https://x/i/ABC and https://x/i/ABC", "https://x/i/ABC")).toBe("Open [invitation link] and [invitation link]");
  });
});

describe("the family's reply", () => {
  const events = ["f1", "f2"];
  const base = { fullName: "Ravi Rao", phone: "+91 98765 43210", attending: "accept", guestCount: "3", events: ["f1"], dietary: "vegetarian", dietaryNotes: "", message: "" };

  it("accepts a good reply and tidies it", () => {
    expect(replySchema(4, events).parse({ ...base, events: ["f1", "f1"] })).toMatchObject({ attending: true, guestCount: 3, events: ["f1"], dietary: "vegetarian" });
  });

  it("clears count, events and food when declining", () => {
    expect(replySchema(4, events).parse({ ...base, attending: "decline" })).toMatchObject({ attending: false, guestCount: 0, events: [], dietary: "none", dietaryNotes: "" });
  });

  it("explains each problem in plain words", () => {
    const errors = (value: object, max: number | null = 4) => { const result = replySchema(max, events).safeParse({ ...base, ...value }); return result.success ? {} : replyErrors(result.error); };
    expect(errors({ guestCount: "5" })).toEqual({ guestCount: "This invitation is for up to 4 guests." });
    expect(errors({ guestCount: "0" })).toEqual({ guestCount: "Please tell us how many of you are coming." });
    expect(errors({ events: [] })).toEqual({ events: "Please choose at least one event." });
    expect(errors({ events: ["other"] })).toEqual({ events: "Please choose from the events listed." });
    expect(errors({ fullName: "R" })).toEqual({ fullName: "Please enter your full name." });
    expect(errors({ phone: "call me" })).toEqual({ phone: "Please enter a valid phone number." });
    expect(errors({ attending: "" })).toEqual({ attending: "Please let us know if you can come." });
    expect(errors({ guestCount: "21" }, null)).toEqual({ guestCount: "This invitation is for up to 20 guests." });
  });

  it("leaves the event check to the database on the server", () => {
    expect(replySchema(null, null).safeParse({ ...base, events: ["anything"] }).success).toBe(true);
    expect(databaseFieldMessage("guestCount", 2)).toEqual({ guestCount: "This invitation is for up to 2 guests." });
    expect(databaseFieldMessage("events", null)).toEqual({ events: "Please choose from the events listed." });
    expect(databaseFieldMessage(undefined, null)).toEqual({});
  });
});

const fam = (id: string, name: string, extra: Partial<DeskFamily> = {}): DeskFamily => ({ id, name, contact_phone: "", invite_code: `CODE${id.padStart(8, "0")}`, invite_max_guests: null, invite_removed_at: null, created_at: "2026-11-01", ...extra });
const reply = (household: string, attending: boolean, count: number, functions: string[], dietary = "none"): DeskReply => ({ household_id: household, attending, guest_count: count, function_ids: functions, dietary, dietary_notes: "", message: "", reply_name: "Ravi", reply_phone: "+91 98765 43210", source: "invite_link", updated_at: "2026-11-20T10:00:00Z" });

describe("the Guest desk", () => {
  const families = [fam("1", "Rao family", { invite_max_guests: 4 }), fam("2", "Pai family"), fam("3", "Bhat family"), fam("4", "Alva family"), fam("5", "Kini family", { invite_removed_at: "2026-11-10" })];
  const invites = [{ household_id: "1", function_id: "f1" }, { household_id: "1", function_id: "f2" }, { household_id: "2", function_id: "f1" }, { household_id: "3", function_id: "f2" }, { household_id: "5", function_id: "f1" }];
  const replies = [reply("1", true, 4, ["f1", "f2"], "vegetarian"), reply("2", false, 0, []), reply("5", true, 2, ["f1"])];
  const messages = [{ household_id: "3", sent_at: "2026-11-02T00:00:00Z", kind: "invite" as const }, { household_id: "3", sent_at: "2026-11-09T00:00:00Z", kind: "remind" as const }];
  const rows = familyRows({ families, invites, replies, messages });
  const byName = (name: string) => rows.find((row) => row.name === name)!;

  it("says “Coming, 4”, “Not coming”, “Not yet” and “No events chosen”", () => {
    expect(replyLabel(byName("Rao family"))).toBe("Coming, 4");
    expect(replyLabel(byName("Pai family"))).toBe("Not coming");
    expect(replyLabel(byName("Bhat family"))).toBe("Not yet");
    expect(replyLabel(byName("Alva family"))).toBe("No events chosen");
    expect(byName("Bhat family")).toMatchObject({ invitedAt: "2026-11-02T00:00:00Z", remindedAt: "2026-11-09T00:00:00Z", reminders: 1 });
  });

  it("lists families who haven't replied first, then by name", () => {
    expect(sortFamilies(rows).map((row) => row.name)).toEqual(["Bhat family", "Alva family", "Kini family", "Pai family", "Rao family"]);
  });

  it("counts families and guests, leaving out removed families and those with no events", () => {
    expect(deskTotals(rows)).toEqual({ invited: 3, replied: 2, waiting: 1, coming: 4 });
    expect(functionHeadcounts([{ id: "f1", name: "Muhurtham" }, { id: "f2", name: "Reception" }], rows)).toEqual([
      { id: "f1", name: "Muhurtham", families: 2, people: 4, notComing: 1, waiting: 0 },
      { id: "f2", name: "Reception", families: 2, people: 4, notComing: 0, waiting: 1 },
    ]);
  });

  it("counts food per event, once per person coming", () => {
    expect(mealsByFunction(["f1", "f2"], [reply("1", true, 4, ["f1", "f2"], "vegetarian"), reply("2", true, 2, ["f1"], "jain"), reply("3", true, 3, ["f2"]), reply("4", false, 0, [])])).toEqual([
      { functionId: "f1", coming: 6, veg: 4, nonveg: 0, jain: 2, vegan: 0, other: 0, notSaid: 0 },
      { functionId: "f2", coming: 7, veg: 4, nonveg: 0, jain: 0, vegan: 0, other: 0, notSaid: 3 },
    ]);
  });

  it("exports a CSV with formulas defused", () => {
    const csv = repliesCsv([byName("Rao family"), { ...byName("Pai family"), name: "=HYPERLINK(1)" }], [{ id: "f1", name: "Muhurtham" }, { id: "f2", name: "Reception" }]);
    const [header, rao, pai] = csv.split("\r\n");
    expect(header).toBe("Family,Phone,Most guests,Invited to,Reply,Coming,Events,Food,Food notes,Message,Replied by,Reply phone,Replied on");
    expect(rao).toBe("Rao family,,4,Muhurtham; Reception,\"Coming, 4\",4,Muhurtham; Reception,vegetarian,,,Ravi,'+91 98765 43210,2026-11-20");
    expect(pai!.startsWith("'=HYPERLINK(1)")).toBe(true);
  });
});

describe("pasting families", () => {
  it("reads name, phone and the most guests, ignoring blank lines", () => {
    const { families, problems } = parseFamilyLines("Rao family, +91 98765 43210, 4\n\n  Pai   family , , 2 \nAsha Aunty & Uncle\r\nBhat family, 3");
    expect(problems).toEqual([]);
    expect(families).toEqual([
      { line: 1, name: "Rao family", phone: "+91 98765 43210", maxGuests: 4 },
      { line: 3, name: "Pai family", phone: "", maxGuests: 2 },
      { line: 4, name: "Asha Aunty & Uncle", phone: "", maxGuests: null },
      { line: 5, name: "Bhat family", phone: "", maxGuests: 3 },
    ]);
  });

  it("adds +91 to bare Indian mobiles and keeps other numbers as typed", () => {
    expect(tidyPhone("98765 43210")).toBe("+91 98765 43210");
    expect(tidyPhone("00353871234567")).toBe("+353871234567");
    expect(tidyPhone("0824 222 3333")).toBe("0824 222 3333");
  });

  it("lists every problem with its line number", () => {
    const { problems } = parseFamilyLines(["Rao family, , 25", "Shenoy, Ravi and Asha, +91 90000 00000, 2", ", +91 98765 43210", "Kini family, call me", "rao   FAMILY, , 21", "Rao family"].join("\n"));
    expect(problems.map(problemText)).toEqual([
      "Line 1 (Rao family): number of guests should be 1 to 20.",
      "Line 2 (Shenoy): use at most two commas (name, phone, number of guests). Leave commas out of the name.",
      "Line 3: add the family's name first, for example “Rao family”.",
      "Line 4 (Kini family): that phone number doesn't look right. Use digits, starting with + and the country code, for example +91 98765 43210.",
      "Line 5 (rao FAMILY): number of guests should be 1 to 20.",
    ]);
    expect(parseFamilyLines("Rao family\nRAO  family").problems.map(problemText)).toEqual(["Line 2 (RAO family): this family is already on line 1."]);
    expect(familyNameKey(" Rao  Family ")).toBe("rao family");
    expect(databaseProblem("exists")).toMatch(/already on your list/);
  });
});

describe("the invitation page", () => {
  it("loads the couple's config and gives each function an illustration", () => {
    expect(invitationConfig.brideName).toBe("Sweekruti");
    expect(invitationConfig.music.src).toBe("/invite/hamsadhwani.mp3");
    expect(eventArtFor("Haldi", "Haldi")).toBe("haldi");
    expect(eventArtFor("Wedding", "Muhurtham")).toBe("muhuratham");
    expect(eventArtFor("Other", "Mehndi night")).toBe("mehendi");
    expect(eventArtFor("Reception", "Dinner")).toBe("reception");
    expect(eventArtFor("Engagement", "Nischay")).toBe("engagement");
    expect(eventArtFor("Sangeet", "Sangeet")).toBe("sangeet");
  });
});

describe("messages reach families", () => {
  it("treats each family's first person as invited, and as replied once the family has replied", () => {
    const guests = [{ id: "g2", household_id: "h1", created_at: "2026-11-02" }, { id: "g1", household_id: "h1", created_at: "2026-11-01" }, { id: "g3", household_id: "h2", created_at: "2026-11-01" }];
    const result = familyRecipients(guests, [{ guest_id: "g3", function_id: "f1" }], [{ household_id: "h1", function_id: "f1" }, { household_id: "h2", function_id: "f1" }, { household_id: "h3", function_id: "f1" }], new Set(["h1"]));
    expect(result.invitations).toEqual([{ id: "family:h1:f1", guest_id: "g1", function_id: "f1", status: "invited" }]);
    expect(result.responded).toEqual(["family:h1:f1"]);
  });
});
