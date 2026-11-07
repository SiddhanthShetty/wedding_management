import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, FUNCTION_A_CEREMONY, OWNER_A, OWNER_B, READ_ONLY, SCOPED, WEDDING_A } from "./support/database";
import { fillText, formatFunctionDate, mailtoUrl, messageWithoutLink, resolveTexts, shareMessage, THEMES, unknownInvitationPlaceholders, whatsappUrl } from "../src/lib/invitations/content";
import { buildCardProps, householdFunctions } from "../src/lib/invitations/card-data";
import { InvitationCard, wrapText } from "../src/components/invitation-card";
import { cleanTextOverrides } from "../src/lib/data/invitations";

describe("invitation wording and share links (pure)", () => {
  it("uses the couple's wording per language and falls back to the built-in text", () => {
    const texts = resolveTexts("kn", { kn: { greeting: "  ನಮಸ್ಕಾರ {{name}}  ", body: "   " }, en: { greeting: "Hello" } });
    expect(texts.greeting).toBe("ನಮಸ್ಕಾರ {{name}}");
    expect(texts.body).toContain("ಆಹ್ವಾನಿಸುತ್ತೇವೆ");
    expect(resolveTexts("tcy", {}).body).toContain("ಮದಿಮೆ");
    expect(fillText("Dear {{ name }}, from {{couple}} {{other}}", { name: "Rao family", couple: "Priya & Arjun" })).toBe("Dear Rao family, from Priya & Arjun {{other}}");
    expect(unknownInvitationPlaceholders("{{name}} {{rsvp}} {{link}}")).toEqual(["rsvp"]);
  });

  it("always includes the private link in the shared message but never in the stored copy", () => {
    const link = "https://wedding.example/guest#" + "a".repeat(43);
    const withPlaceholder = shareMessage(resolveTexts("en", {}), { name: "Rao family", couple: "Priya & Arjun", link });
    expect(withPlaceholder).toContain(link);
    const without = shareMessage(resolveTexts("en", { en: { share: "Hello {{name}}!" } }), { name: "Rao family", couple: "P", link });
    expect(without).toBe(`Hello Rao family!\n${link}`);
    expect(messageWithoutLink(without, link)).toBe("Hello Rao family!\n[private invitation link]");
  });

  it("only targets a WhatsApp chat for an international number and builds a safe mailto", () => {
    expect(whatsappUrl("+91 98450 12345", "Hi & welcome")).toEqual({ url: "https://wa.me/919845012345?text=Hi%20%26%20welcome", hasNumber: true });
    expect(whatsappUrl("098450 12345", "Hi").hasNumber).toBe(false);
    expect(whatsappUrl("098450 12345", "Hi").url).toBe("https://wa.me/?text=Hi");
    expect(whatsappUrl("+12", "Hi").hasNumber).toBe(false);
    expect(mailtoUrl("asha@example.test", "Invite", "Line 1\nLine 2")).toBe("mailto:asha@example.test?subject=Invite&body=Line%201%0ALine%202");
    expect(mailtoUrl("bad address?cc=x@y.z", "Invite", "x")).toBe("mailto:?subject=Invite&body=x");
  });

  it("formats dates in the household's language and orders a household's functions", () => {
    expect(formatFunctionDate("2027-06-18", "14:30", "en")).toMatch(/Friday.*18 June 2027.*2:30/);
    expect(formatFunctionDate("2027-06-18", null, "kn")).not.toMatch(/Friday/);
    expect(formatFunctionDate(null, null, "hi")).toBe("");
    const functions = [{ id: "b", name: "Wedding", function_date: "2027-06-18", start_time: "14:30", venue_name: "Hall" }, { id: "a", name: "Sangeet", function_date: "2027-06-17", start_time: "19:00", venue_name: null }, { id: "c", name: "Reception", function_date: "2027-06-19", start_time: null, venue_name: null }];
    const mine = householdFunctions("h1", [{ id: "g1", household_id: "h1" }, { id: "g2", household_id: "h1" }, { id: "g3", household_id: "h2" }], [{ guest_id: "g1", function_id: "b" }, { guest_id: "g2", function_id: "b" }, { guest_id: "g2", function_id: "a" }, { guest_id: "g3", function_id: "c" }], functions);
    expect(mine.map((fn) => fn.id)).toEqual(["b", "a"]);
    const card = buildCardProps({ theme: "veena", accent: null, overrides: {}, language: "en", couple: "Priya & Arjun", greetingName: "Rao family", functions: mine });
    expect(card.functions.map((fn) => fn.name)).toEqual(["Sangeet", "Wedding"]);
    expect(card.greeting).toBe("Dear Rao family,");
  });

  it("renders every theme with the guest's details and fits long text", () => {
    for (const theme of THEMES) {
      const props = buildCardProps({ theme: theme.id, accent: null, overrides: {}, language: "kn", couple: "Priya & Arjun", greetingName: "ರಾವ್ ಕುಟುಂಬ", functions: Array.from({ length: 7 }, (_, i) => ({ name: `Function ${i + 1}`, function_date: "2027-06-18", start_time: "10:00", venue_name: "Mangaluru" })) });
      const markup = renderToStaticMarkup(createElement(InvitationCard, props));
      expect(markup, theme.id).toContain("Priya &amp; Arjun");
      expect(markup, theme.id).toContain("ರಾವ್ ಕುಟುಂಬ");
      expect(markup, theme.id).toMatch(/\+[1-9]/); // overflowing functions are summarised, never drawn over the footer
    }
    expect(wrapText("one two three four five six", 9, 2)).toEqual(["one two", "three…"]);
  });

  it("cleans submitted wording: unknown languages and keys dropped, unknown placeholders rejected", () => {
    expect(cleanTextOverrides({ en: { greeting: " Hi {{name}} ", hack: "x" }, fr: { greeting: "Salut" }, kn: { body: "" } })).toEqual({ en: { greeting: "Hi {{name}}" } });
    expect(() => cleanTextOverrides({ en: { body: "Hi {{guest}}" } })).toThrow(/Unknown placeholder/);
    expect(() => cleanTextOverrides({ en: { body: "x".repeat(601) } })).toThrow(/600/);
  });
});

describe("invitation designs in the database", () => {
  let db: PGlite;
  afterEach(async () => { await db.close(); });
  const design = (name: string) => db.query<{ id: string }>("insert into public.invitation_designs(wedding_id,name,theme,texts,created_by_user_id,updated_by_user_id) values($1,$2,'mallige',$3::jsonb,$4,$4) returning id", [WEDDING_A, name, JSON.stringify({ kn: { greeting: "ನಮಸ್ಕಾರ {{name}}" } }), OWNER_A]);

  it("lets guest editors manage designs, keeps one default and shows guests their language", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const first = (await design("TEST Mallige")).rows[0]!.id;
    const second = (await design("TEST Veena")).rows[0]!.id;
    await db.query("select public.set_default_invitation_design($1,$2)", [WEDDING_A, first]);
    await db.query("select public.set_default_invitation_design($1,$2)", [WEDDING_A, second]);
    expect((await db.query<{ id: string }>("select id from public.invitation_designs where is_default")).rows.map((row) => row.id)).toEqual([second]);
    await expectDenied(db.query("update public.invitation_designs set is_default=true where id=$1", [first]), /permission denied/);
    await expectDenied(db.query("insert into public.invitation_designs(wedding_id,name,theme,created_by_user_id,updated_by_user_id) values($1,'x','disco',$2,$2)", [WEDDING_A, OWNER_A]));

    const household = await db.query<{ id: string }>("select public.save_guest_household($1,null,$2::jsonb) id", [WEDDING_A, JSON.stringify({ name: "TEST Shetty family" })]);
    const guest = await db.query<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household.rows[0]!.id, full_name: "TEST Guest", email: "", phone: "", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })]);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest.rows[0]!.id, FUNCTION_A]);
    await db.query("select public.set_household_language($1,$2,'kn')", [WEDDING_A, household.rows[0]!.id]);
    await expectDenied(db.query("select public.set_household_language($1,$2,'fr')", [WEDDING_A, household.rows[0]!.id]));
    await db.query("update public.invitation_designs set texts=$2::jsonb where id=$1", [second, JSON.stringify({ kn: { greeting: "ನಮಸ್ಕಾರ {{name}}" }, en: { greeting: "Hello" } })]);
    await db.query("select public.create_guest_portal_link($1,$2,'{}'::uuid[],$3,$4::timestamptz)", [WEDDING_A, guest.rows[0]!.id, "f".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    await assumeUser(db, null, "anon");
    await db.query("select public.create_guest_portal_session($1,$2)", ["f".repeat(64), "9".repeat(64)]);
    const portal = (await db.query<{ data: { household: { language: string }; invitation: { theme: string; texts: Record<string, string> } } }>("select public.get_guest_portal_data($1) data", ["9".repeat(64)])).rows[0]!.data;
    expect(portal.household.language).toBe("kn");
    expect(portal.invitation).toEqual({ theme: "mallige", accent: null, texts: { greeting: "ನಮಸ್ಕಾರ {{name}}" } });
    await expectDenied(db.query("select * from public.invitation_designs"));
    expect(FUNCTION_A_CEREMONY).toBeTruthy();
  });

  it("keeps designs inside the guest module and the wedding", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    await design("TEST private");
    await assumeUser(db, SCOPED); // no guest-module access
    expect((await db.query("select id from public.invitation_designs")).rows).toHaveLength(0);
    await expectDenied(db.query("select public.set_household_language($1,$2,'en')", [WEDDING_A, WEDDING_A]));
    await assumeUser(db, OWNER_A);
    await db.query("select public.set_member_module_access($1,$2,'guests','read')", [WEDDING_A, READ_ONLY]);
    await assumeUser(db, READ_ONLY);
    expect((await db.query("select id from public.invitation_designs")).rows).toHaveLength(1);
    expect((await db.query("update public.invitation_designs set name='renamed' returning id")).rows).toHaveLength(0); // RLS filters the write
    await assumeUser(db, OWNER_A);
    expect((await db.query<{ name: string }>("select name from public.invitation_designs")).rows[0]!.name).toBe("TEST private");
    await assumeUser(db, OWNER_B);
    expect((await db.query("select id from public.invitation_designs")).rows).toHaveLength(0);
  });
});
