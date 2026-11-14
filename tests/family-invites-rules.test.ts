/** Family invitations: links, messages, the reply form, the Guest desk's counts and the paste box. */
import { describe, expect, it } from "vitest";
import {
  CODE_PATTERN, databaseFieldMessage, deleteText, deskTotals, familyRows, functionHeadcounts, inviteLink, inviteMessage, mealsByFunction, newInviteCode, reminderMessage,
  repliesCsv, replyErrors, replyLabel, replySchema, sortFamilies, whatsappLink, withoutLink, type DeskFamily, type DeskReply,
} from "../src/lib/family-invites/rules";
import { checkFamilyEntries, databaseProblem, familyNameKey, phoneProblem, tidyPhone } from "../src/lib/planning/family-entries";
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
    expect(errors({ guestCount: "5" })).toEqual({ guestCount: "Please choose how many of you are coming from the list." });
    expect(errors({ guestCount: "0" })).toEqual({ guestCount: "Please tell us how many of you are coming." });
    expect(errors({ events: [] })).toEqual({ events: "Please choose at least one event." });
    expect(errors({ events: ["other"] })).toEqual({ events: "Please choose from the events listed." });
    expect(errors({ fullName: "R" })).toEqual({ fullName: "Please enter your full name." });
    expect(errors({ phone: "call me" })).toEqual({ phone: "Please enter a valid phone number." });
    expect(errors({ attending: "" })).toEqual({ attending: "Please let us know if you can come." });
    expect(errors({ guestCount: "21" }, null)).toEqual({ guestCount: "Please choose how many of you are coming from the list." });
    // The family's guest limit is never written out on the invitation.
    for (const message of Object.values(errors({ guestCount: "5" }))) expect(message).not.toMatch(/\d/);
  });

  it("leaves the event check to the database on the server", () => {
    expect(replySchema(null, null).safeParse({ ...base, events: ["anything"] }).success).toBe(true);
    expect(databaseFieldMessage("guestCount", 2)).toEqual({ guestCount: "Please choose how many of you are coming from the list." });
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

  it("says plainly what deleting a family removes", () => {
    expect(deleteText({ people: 3, reply: byName("Rao family").reply })).toBe("This permanently deletes the 3 people in it, their reply, their link and their message records. It can't be undone. If someone has a room or an upcoming ride booked, cancel that first.");
    expect(deleteText({ people: 1, reply: null })).toMatch(/^This permanently deletes the person in it, their link/);
    expect(deleteText({ people: 0, reply: null })).toMatch(/^This permanently deletes the family, their link/);
    expect(familyRows({ families: [fam("9", "X family")], invites: [], replies: [], messages: [], people: { "9": 2 } })[0]!.people).toBe(2);
  });

  it("lists families who haven't replied first, then by name", () => {
    expect(sortFamilies(rows).map((row) => row.name)).toEqual(["Bhat family", "Alva family", "Pai family", "Rao family", "Kini family"]);
    // A family whose link was turned off earlier says so until it replies.
    expect(replyLabel({ ...byName("Kini family"), reply: null })).toBe("Link turned off");
    expect(replyLabel(byName("Kini family"))).toBe("Coming, 2");
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

describe("adding families, one row each", () => {
  const row = (name: string, phone = "", guests = "") => ({ name, phone, guests });

  it("reads each row's name, phone and most guests, and skips empty rows", () => {
    expect(checkFamilyEntries([row("  Rao   family ", "98765 43210", "4"), row(""), row("Asha Aunty & Uncle"), row("Pai family", "+44 7700 900123", "")])).toEqual({
      families: [
        { row: 0, name: "Rao family", phone: "+91 98765 43210", maxGuests: 4 },
        { row: 2, name: "Asha Aunty & Uncle", phone: "", maxGuests: null },
        { row: 3, name: "Pai family", phone: "+44 7700 900123", maxGuests: null },
      ],
      errors: [],
    });
  });

  it("tidies Indian mobiles however they are typed, and asks for a country code otherwise", () => {
    for (const typed of ["98765 43210", "9876543210", "+91 98765-43210", "0091 98765 43210", "919876543210"]) expect(tidyPhone(typed)).toBe("+91 98765 43210");
    expect(tidyPhone("00353871234567")).toBe("+353871234567");
    expect(phoneProblem(tidyPhone("0824 222 3333"))).toMatch(/10-digit mobile number, or \+ and the country code/);
    expect(phoneProblem(tidyPhone("98765"))).toMatch(/10-digit/);
    expect(phoneProblem(tidyPhone("+91 98"))).toMatch(/doesn't look right/);
    expect(phoneProblem("call me")).toBe("Use digits only, for example 98765 43210.");
    expect(phoneProblem("")).toBeNull();
  });

  it("reports each problem against its own box, and adds nothing", () => {
    const result = checkFamilyEntries([row("Rao family", "", "25"), row("", "98765 43210"), row("R"), row("1234"), row("Kini family", "call me", "two"), row("Rao family"), row("rao   FAMILY"), row("<b>Bad</b> family")]);
    expect(result.errors).toEqual([
      { row: 0, field: "guests", message: "Enter a number from 1 to 20." },
      { row: 1, field: "name", message: "Enter the family's name, for example “Rao family”." },
      { row: 2, field: "name", message: "Use at least 2 letters." },
      { row: 3, field: "name", message: "The name needs letters, not just numbers or symbols." },
      { row: 4, field: "phone", message: "Use digits only, for example 98765 43210." },
      { row: 4, field: "guests", message: "Enter a whole number, like 4." },
      { row: 5, field: "name", message: "This family is already in row 1." },
      { row: 6, field: "name", message: "This family is already in row 1." },
      { row: 7, field: "name", message: "Leave out < and > and special characters." },
    ]);
  });

  it("needs at least one family, at most 50, and names under 120 letters", () => {
    expect(checkFamilyEntries([row(""), row("")]).errors).toEqual([{ row: 0, field: "name", message: "Enter at least one family." }]);
    expect(checkFamilyEntries(Array.from({ length: 51 }, (_, i) => row(`Family ${i + 1}`))).errors).toEqual([{ row: 50, field: "name", message: "Add up to 50 families at a time." }]);
    expect(checkFamilyEntries([row("x".repeat(121))]).errors[0]!.message).toBe("Keep the name under 120 characters.");
    expect(checkFamilyEntries([row("Rao family", "", "0")]).errors[0]!.message).toBe("Enter a number from 1 to 20.");
  });

  it("compares names like the database does, and explains its refusals", () => {
    expect(familyNameKey(" Rao  Family ")).toBe("rao family");
    expect(databaseProblem("exists")).toMatch(/already on your list/);
  });
});

describe("the invitation page", () => {
  it("loads the couple's config and gives each function an illustration", () => {
    expect(invitationConfig.brideName).toBe("Sweekruti");
    expect(invitationConfig.music).toEqual({ title: "A Sacred Carnatic Wedding Melody", src: "/audio/wedding-music.mp3", credit: "NirvanaSutra Music" });
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
