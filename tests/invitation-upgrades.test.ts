import { describe, expect, it } from "vitest";
import { PORTAL_LOCALES, PORTAL_STRINGS, translateResult } from "../src/lib/guest-portal/i18n";
import { familyNames } from "../src/lib/invitations/export-card";
import { contrastRatio, LANGUAGES, readableAccent, THEMES } from "../src/lib/invitations/content";
import { daysBetween } from "../src/lib/data/dashboard-dates";

describe("guest portal translations", () => {
  it("has every string in every supported language, with Kannada script for Tulu", () => {
    const keys = Object.keys(PORTAL_STRINGS.en).sort();
    for (const { code } of LANGUAGES) {
      expect(Object.keys(PORTAL_STRINGS[code]).sort(), code).toEqual(keys);
      for (const key of keys) {
        const value = PORTAL_STRINGS[code][key as keyof typeof PORTAL_STRINGS.en];
        const text = typeof value === "function" ? (value as (a: never, b: never) => string)("X" as never, "Y" as never) : value;
        expect(text.trim().length, `${code}.${key}`).toBeGreaterThan(0);
      }
    }
    expect(PORTAL_STRINGS.kn.yes).toMatch(/[ಀ-೿]/);
    expect(PORTAL_STRINGS.hi.yes).toMatch(/[ऀ-ॿ]/);
    expect(PORTAL_STRINGS.tcy.yes).toMatch(/[ಀ-೿]/);
    expect(PORTAL_STRINGS.tcy.yes).not.toBe(PORTAL_STRINGS.kn.yes);
    expect(PORTAL_LOCALES.tcy).toBe("kn-IN");
  });

  it("shows server results in the guest's language", () => {
    const t = PORTAL_STRINGS.kn;
    expect(translateResult(t, { message: "2 responses saved together." })).toEqual({ message: t.savedResponses(2) });
    expect(translateResult(t, { message: "These responses were already saved." })).toEqual({ message: t.alreadySaved });
    expect(translateResult(t, { message: "Your information has been updated." })).toEqual({ message: t.savedInfo });
    expect(translateResult(t, { error: "This response changed after you opened the page. Refresh and try again." })).toEqual({ error: t.conflict });
    expect(translateResult(t, { error: "This invitation link is not available. Please contact your hosts for help." })).toEqual({ error: t.unavailableShort });
    expect(translateResult(t, { error: "Choose a response for each invited function." })).toEqual({ error: t.invalid });
    expect(translateResult(t, {})).toEqual({});
  });
});

describe("card export fonts", () => {
  it("reads family names from a computed font-family, dropping generic families", () => {
    expect(familyNames(`"__Cormorant_Garamond_a1b2c3", "__Noto_Serif_Kannada_d4", Georgia, serif`)).toEqual(["__Cormorant_Garamond_a1b2c3", "__Noto_Serif_Kannada_d4", "Georgia"]);
    expect(familyNames("system-ui, sans-serif")).toEqual([]);
  });
});

describe("invitation website content", async () => {
  const { countdownParts, isLiveWindow, nextFunctionStart, parseSite, readSite } = await import("../src/lib/invitations/site");
  it("validates website content strictly and reads stored content leniently", () => {
    const fn = "a2000000-0000-4000-8000-000000000001";
    expect(parseSite({ story: [{ title: " Met in Mangaluru ", text: "", when: "2019" }], faqs: [], palettes: { [fn]: ["#E9B44C"] }, livestream_url: "", extra: "dropped" }))
      .toEqual({ opening_animation: true, countdown: true, blessings_enabled: false, livestream_url: null, story: [{ title: "Met in Mangaluru", text: "", when: "2019" }], faqs: [], palettes: { [fn]: ["#E9B44C"] } });
    expect(() => parseSite({ livestream_url: "http://insecure.example" })).toThrow(/https/);
    expect(() => parseSite({ palettes: { [fn]: ["red"] } })).toThrow(/#E9B44C/);
    expect(() => parseSite({ story: Array.from({ length: 9 }, () => ({ title: "x", text: "", when: "" })) })).toThrow(/8/);
    expect(() => parseSite({ faqs: [{ question: "Parking?", answer: "" }] })).toThrow(/Answer/);
    expect(readSite({ story: "broken" }).story).toEqual([]);
    expect(readSite(null).countdown).toBe(true);
  });

  it("counts down to the next function and opens a live window around its start", () => {
    const now = new Date("2027-06-17T10:00:00Z");
    const target = nextFunctionStart([{ name: "Past", startsAt: "2027-06-16T10:00:00Z" }, { name: "Muhurtham", startsAt: "2027-06-18T05:00:00Z" }, { name: "Reception", startsAt: "2027-06-18T13:30:00Z" }, { name: "Undated", startsAt: null }], now);
    expect(target?.name).toBe("Muhurtham");
    expect(countdownParts(target!.startsAt, now)).toEqual({ days: 0, hours: 19, minutes: 0 });
    expect(countdownParts(new Date("2027-06-17T09:00:00Z"), now)).toBeNull();
    const start = new Date("2027-06-18T05:00:00Z");
    expect(isLiveWindow(start, new Date("2027-06-18T04:29:00Z"))).toBe(false);
    expect(isLiveWindow(start, new Date("2027-06-18T04:30:00Z"))).toBe(true);
    expect(isLiveWindow(start, new Date("2027-06-18T11:00:00Z"))).toBe(true);
    expect(isLiveWindow(start, new Date("2027-06-18T11:01:00Z"))).toBe(false);
  });
});

describe("blessings wall in the database", async () => {
  const { afterEach } = await import("vitest");
  const { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, OWNER_B, SCOPED, WEDDING_A, testHousehold } = await import("./support/database");
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  afterEach(async () => { await db?.close(); });
  const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

  async function setup(enabled: boolean) {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const household = await testHousehold(db, WEDDING_A, "TEST Blessing family");
    const guest = (await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household, full_name: "Asha Rao", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).id;
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest, FUNCTION_A]);
    const design = (await one<{ id: string }>("insert into public.invitation_designs(wedding_id,name,theme,created_by_user_id,updated_by_user_id) values($1,'TEST','veena',$2,$2) returning id", [WEDDING_A, OWNER_A])).id;
    await db.query("select public.set_default_invitation_design($1,$2)", [WEDDING_A, design]);
    await db.query("update public.invitation_designs set site=$2::jsonb where id=$1", [design, JSON.stringify({ blessings_enabled: enabled, story: [{ title: "We met", text: "", when: "2019" }] })]);
    await db.query("select public.create_guest_portal_link($1,$2,$3::uuid[],$4,$5::timestamptz)", [WEDDING_A, guest, [], "a".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    await assumeUser(db, null, "anon");
    await db.query("select public.create_guest_portal_session($1,$2)", ["a".repeat(64), "b".repeat(64)]);
    return { guest, design };
  }
  const submit = (message: string, key: string) => one<{ r: { status: string } }>("select public.submit_guest_portal_blessing($1,$2,$3) r", ["b".repeat(64), message, key]);
  const key = (n: number) => `c1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("accepts blessings only when enabled, keeps them private until approved, and limits each guest", async () => {
    await setup(false);
    expect((await submit("Congratulations!", key(1))).r.status).toBe("unavailable");
    await db.close();
    await setup(true);
    expect((await submit("  ", key(1))).r.status).toBe("invalid");
    expect((await submit("Congratulations!", key(1))).r.status).toBe("saved");
    expect((await submit("Congratulations!", key(1))).r.status).toBe("duplicate");
    for (let i = 2; i <= 5; i += 1) expect((await submit(`Wish ${i}`, key(i))).r.status).toBe("saved");
    expect((await submit("One too many", key(6))).r.status).toBe("limit");
    let portal = (await one<{ data: { site: { story: unknown[] }; blessings: unknown[]; my_pending_blessings: number } }>("select public.get_guest_portal_data($1) data", ["b".repeat(64)])).data;
    expect(portal.site.story).toHaveLength(1);
    expect(portal.blessings).toEqual([]);
    expect(portal.my_pending_blessings).toBe(5);
    await expectDenied(db.query("select * from public.guest_blessings"));
    await assumeUser(db, SCOPED); // no guest-module access
    expect((await db.query("select id from public.guest_blessings")).rows).toHaveLength(0);
    await assumeUser(db, OWNER_B);
    expect((await db.query("update public.guest_blessings set status='approved',approved_at=now() returning id")).rows).toHaveLength(0);
    await assumeUser(db, OWNER_A);
    await expectDenied(db.query("update public.guest_blessings set message='edited'"), /permission denied/);
    const approved = await one<{ moderated_by_user_id: string }>("update public.guest_blessings set status='approved',approved_at=now() where message='Congratulations!' returning moderated_by_user_id");
    expect(approved.moderated_by_user_id).toBe(OWNER_A);
    await assumeUser(db, null, "anon");
    portal = (await one<{ data: { site: { story: unknown[] }; blessings: unknown[]; my_pending_blessings: number } }>("select public.get_guest_portal_data($1) data", ["b".repeat(64)])).data;
    expect(portal.blessings).toEqual([expect.objectContaining({ name: "Asha", message: "Congratulations!" })]);
    expect(portal.my_pending_blessings).toBe(4);
  });
});

describe("card upgrades (pure)", async () => {
  const { estimateWidth, fitLines, FormattedCard, CARD_FORMATS } = await import("../src/components/invitation-card");
  const { buildCardProps, monogramFor } = await import("../src/lib/invitations/card-data");
  const { checkPhotoDataUrl } = await import("../src/lib/invitations/photo");
  const { qrPath } = await import("../src/lib/invitations/qr");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");

  it("measures Indic text as wider than Latin and shrinks long names to fit", () => {
    expect(estimateWidth("ಶೆಟ್ಟಿ ಕುಟುಂಬ", 32)).toBeGreaterThan(estimateWidth("Shetty", 32));
    const short = fitLines("Priya & Arjun", { maxWidth: 920, size: 72, minSize: 44, maxLines: 2 });
    expect(short).toEqual({ lines: ["Priya & Arjun"], size: 72 });
    const long = fitLines("Vishwanatha Krishnamurthy & Annapoorneshwari Subramanyam", { maxWidth: 920, size: 72, minSize: 44, maxLines: 2 });
    expect(long.lines).toHaveLength(2);
    expect(long.size).toBeLessThan(72);
    expect(long.lines.every((line) => estimateWidth(line, long.size) <= 920)).toBe(true);
    const overflow = fitLines("word ".repeat(80), { maxWidth: 300, size: 30, minSize: 24, maxLines: 2 });
    expect(overflow.lines).toHaveLength(2);
    expect(overflow.lines[1]!.endsWith("…")).toBe(true);
  });

  it("makes a monogram from the couple's first letters in any script", () => {
    expect(monogramFor("Priya & Arjun")).toBe("P · A");
    expect(monogramFor("ಪ್ರಿಯಾ and ಅರ್ಜುನ್")).toBe("ಪ್ರಿ · ಅ".replace("ಪ್ರಿ", "ಪ್"));
    expect(monogramFor("")).toBeNull();
  });

  it("accepts only real, small JPEG or WebP photos", () => {
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]).toString("base64")}`;
    expect(checkPhotoDataUrl(jpeg)).toBeNull();
    expect(checkPhotoDataUrl(jpeg.replace("image/jpeg", "image/webp"))).toMatch(/not a valid photo/);
    expect(checkPhotoDataUrl("data:image/png;base64,iVBORw0KGgo=")).toMatch(/JPEG or WebP/);
    expect(checkPhotoDataUrl(`data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`)).toMatch(/JPEG or WebP/);
    expect(checkPhotoDataUrl(`data:image/jpeg;base64,${Buffer.alloc(340_000, 0xff).toString("base64")}`)).toMatch(/too large/);
  });

  it("renders every format, with the guest's QR code only on the print card", () => {
    const card = buildCardProps({ theme: "kanchi", accent: null, overrides: {}, language: "en", couple: "Priya & Arjun", greetingName: "Asha Rao", functions: [{ name: "Muhurtham", function_date: "2027-06-18", start_time: "10:30", venue_name: "Kudroli" }] });
    const qr = qrPath("https://wedding.example/guest#" + "a".repeat(43));
    expect(qr.size).toBeGreaterThanOrEqual(21);
    for (const format of Object.keys(CARD_FORMATS) as Array<keyof typeof CARD_FORMATS>) {
      const markup = renderToStaticMarkup(createElement(FormattedCard, { format, card, qr: format === "print" ? qr : null, qrLabel: "Open your invitation" }));
      expect(markup, format).toContain(`viewBox="0 0 ${CARD_FORMATS[format].width} ${CARD_FORMATS[format].height}"`);
      expect(markup, format).toContain("Asha Rao");
      expect(markup.includes(qr.d), format).toBe(format === "print");
    }
    const withPhoto = renderToStaticMarkup(createElement(FormattedCard, { format: "portrait", card: { ...card, photoUrl: "/guest/photo" } }));
    expect(withPhoto).toContain('href="/guest/photo"');
    expect(withPhoto).not.toContain("P · A");
    expect(renderToStaticMarkup(createElement(FormattedCard, { format: "portrait", card }))).toContain("P · A");
  });
});

describe("couple photo in the database", async () => {
  const { afterEach } = await import("vitest");
  const { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, WEDDING_A, testHousehold } = await import("./support/database");
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  afterEach(async () => { await db?.close(); });
  const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64")}`;

  it("stores only small JPEG/WebP data URLs and serves them to valid guest sessions only", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const household = await testHousehold(db, WEDDING_A);
    const guest = (await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household, full_name: "TEST Photo guest", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).id;
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest, FUNCTION_A]);
    const design = (await one<{ id: string }>("insert into public.invitation_designs(wedding_id,name,theme,created_by_user_id,updated_by_user_id) values($1,'TEST','mallige',$2,$2) returning id", [WEDDING_A, OWNER_A])).id;
    await db.query("select public.set_default_invitation_design($1,$2)", [WEDDING_A, design]);
    await expectDenied(db.query("update public.invitation_designs set photo_data='data:image/svg+xml;base64,PHN2Zz4=' where id=$1", [design]));
    await expectDenied(db.query("update public.invitation_designs set photo_data=$2 where id=$1", [design, `data:image/jpeg;base64,${"A".repeat(450_000)}`]));
    await db.query("update public.invitation_designs set photo_data=$2,show_monogram=false where id=$1", [design, jpeg]);
    await db.query("select public.create_guest_portal_link($1,$2,$3::uuid[],$4,$5::timestamptz)", [WEDDING_A, guest, [], "a".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    await assumeUser(db, null, "anon");
    expect((await one<{ p: string | null }>("select public.get_guest_portal_photo($1) p", ["b".repeat(64)])).p).toBeNull();
    await db.query("select public.create_guest_portal_session($1,$2)", ["a".repeat(64), "b".repeat(64)]);
    expect((await one<{ p: string }>("select public.get_guest_portal_photo($1) p", ["b".repeat(64)])).p).toBe(jpeg);
    const portal = (await one<{ data: { invitation: { has_photo: boolean; show_monogram: boolean } } }>("select public.get_guest_portal_data($1) data", ["b".repeat(64)])).data;
    expect(portal.invitation).toMatchObject({ has_photo: true, show_monogram: false });
    expect(JSON.stringify(portal)).not.toContain("base64");
    await assumeUser(db, OWNER_A);
    await expectDenied(db.query("select public.get_guest_portal_photo($1)", ["b".repeat(64)]));
  });
});

describe("link activity for sending", async () => {
  const { afterEach } = await import("vitest");
  const { linkActivity } = await import("../src/lib/data/invitations");
  const { assumeUser, createTestDatabase, FUNCTION_A, OWNER_A, WEDDING_A, testHousehold } = await import("./support/database");
  let db: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  afterEach(async () => { await db?.close(); db = undefined; });

  it("keeps the latest opening across a guest's links and ignores links without a guest", () => {
    expect(linkActivity([
      { guest_id: "g1", active: false, last_opened_at: "2027-06-01T10:00:00Z" },
      { guest_id: "g1", active: true, last_opened_at: null },
      { guest_id: "g2", active: true, last_opened_at: "2027-06-02T09:00:00Z" },
      { guest_id: null, active: false, last_opened_at: "2027-06-03T09:00:00Z" },
    ])).toEqual({ g1: { active: true, lastOpenedAt: "2027-06-01T10:00:00Z" }, g2: { active: true, lastOpenedAt: "2027-06-02T09:00:00Z" } });
  });

  it("reports when a guest opened their link, without recording anything new", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const household = await testHousehold(db, WEDDING_A);
    const guest = (await db.query<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household, full_name: "TEST Opener", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).rows[0]!.id;
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest, FUNCTION_A]);
    await db.query("select public.create_guest_portal_link($1,$2,$3::uuid[],$4,$5::timestamptz)", [WEDDING_A, guest, [], "a".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    const before = (await db.query<{ links: Array<{ last_opened_at: string | null }> }>("select public.list_guest_portal_links($1,null) links", [WEDDING_A])).rows[0]!.links;
    expect(before[0]!.last_opened_at).toBeNull();
    await assumeUser(db, null, "anon");
    await db.query("select public.create_guest_portal_session($1,$2)", ["a".repeat(64), "b".repeat(64)]);
    await db.query("select public.get_guest_portal_data($1)", ["b".repeat(64)]);
    await assumeUser(db, OWNER_A);
    const after = (await db.query<{ links: Array<{ guest_id: string; last_opened_at: string | null }> }>("select public.list_guest_portal_links($1,null) links", [WEDDING_A])).rows[0]!.links;
    expect(after[0]).toMatchObject({ guest_id: guest });
    expect(after[0]!.last_opened_at).not.toBeNull();
  });
});

describe("video invitations (pure parts)", async () => {
  const { frameState, pickVideoFormat, VIDEO_SECONDS, VIDEO_SIZE } = await import("../src/lib/invitations/video");
  it("prefers MP4 for WhatsApp and falls back to WebM, or reports no support", () => {
    expect(pickVideoFormat((mime) => mime.startsWith("video/mp4"))).toEqual({ mime: "video/mp4;codecs=avc1,mp4a", extension: "mp4" });
    expect(pickVideoFormat((mime) => mime === "video/webm;codecs=vp8,opus")).toEqual({ mime: "video/webm;codecs=vp8,opus", extension: "webm" });
    expect(pickVideoFormat(() => false)).toBeNull();
  });
  it("fades the card in, ends with the closing line, and keeps petals on screen", () => {
    expect(frameState(0).cardOpacity).toBe(0);
    expect(frameState(1.2).cardOpacity).toBeCloseTo(1);
    expect(frameState(1).outroOpacity).toBe(0);
    expect(frameState(VIDEO_SECONDS).outroOpacity).toBeCloseTo(1);
    expect(frameState(3.3)).toEqual(frameState(3.3)); // deterministic: same guest, same video
    for (const t of [0, 2.5, 5, VIDEO_SECONDS]) for (const petal of frameState(t).petals) {
      expect(petal.y).toBeGreaterThanOrEqual(-60);
      expect(petal.y).toBeLessThanOrEqual(VIDEO_SIZE.height + 60);
    }
  });
});

describe("theme readability and dates", () => {
  it("keeps every theme's text colours at 4.5:1 or better on its background", () => {
    for (const theme of THEMES) {
      expect(contrastRatio(theme.ink, theme.background), `${theme.id} ink`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.accentText, theme.background), `${theme.id} accentText`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("only uses a custom accent for text when it is readable", () => {
    expect(readableAccent("mallige", "#ffff00")).toBe("#7f5b14");
    expect(readableAccent("mallige", "#5b1622")).toBe("#5b1622");
  });
  it("counts whole days to the wedding", () => {
    expect(daysBetween("2026-11-07", "2026-12-20")).toBe(43);
    expect(daysBetween("2026-12-20", "2026-12-20")).toBe(0);
    expect(daysBetween("2027-01-01", "2026-12-31")).toBe(-1);
    expect(daysBetween("2027-03-27", "2027-03-29")).toBe(2);
  });
});
