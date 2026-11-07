import { afterEach, describe, expect, it } from "vitest";
import { parseSite, readSite, EMPTY_SITE } from "../src/lib/invitations/site";
import { buildPreviewData, previewFunction } from "../src/lib/invitations/preview";
import { PORTAL_STRINGS } from "../src/lib/guest-portal/i18n";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, OWNER_B, SCOPED, WEDDING_A } from "./support/database";

describe("studio content fields", () => {
  it("fills new fields with defaults for websites saved before they existed", () => {
    const old = readSite({ countdown: false, story: [{ title: "We met", text: "", when: "" }] });
    expect(old.countdown).toBe(false);
    expect(old.parents).toEqual({ one: "", two: "" });
    expect(old.closing).toEqual({ title: "", names: [] });
    expect(old.titles).toEqual(EMPTY_SITE.titles);
    expect(parseSite({})).toEqual(EMPTY_SITE);
  });

  it("accepts the couple's content and cleans Instagram handles", () => {
    const site = parseSite({
      blessing_header: "|| Shree Ganeshaya Namah ||", parents: { one: "D/o Smt. Lakshmi & Sri Prakash Shetty", two: "S/o Sri Ramesh Rai" },
      info_cards: [{ title: "Getting there", text: "Take the Udupi road.", phone: "+91 98450 12345" }],
      closing: { title: "", names: ["Shetty family"] }, hashtag: "#RaviWedsMeera", instagram: ["@ravi.rai", "meera_s"],
      reveal: { title: "ನಿಮಗೆ ಸ್ವಾಗತ", hint: "" }, titles: { story: "Our journey", info: "", faq: "", blessings: "" },
    });
    expect(site.instagram).toEqual(["ravi.rai", "meera_s"]);
    expect(site.info_cards[0]!.phone).toBe("+91 98450 12345");
    expect(parseSite({ hashtag: "#ರವಿ_ಮೀರಾ" }).hashtag).toBe("#ರವಿ_ಮೀರಾ");
  });

  it("rejects content guests should not see", () => {
    expect(() => parseSite({ hashtag: "#two words" })).toThrow(/hashtag/);
    expect(() => parseSite({ hashtag: "nohash" })).toThrow(/hashtag/);
    expect(() => parseSite({ instagram: ["bad handle!"] })).toThrow(/Instagram/);
    expect(() => parseSite({ instagram: ["a", "b", "c", "d"] })).toThrow(/3 Instagram/);
    expect(() => parseSite({ info_cards: [{ title: "Call", text: "", phone: "call me" }] })).toThrow(/Phone/);
    expect(() => parseSite({ info_cards: [{ title: "", text: "x", phone: "" }] })).toThrow(/title/);
    expect(() => parseSite({ closing: { title: "", names: [""] } })).toThrow(/empty/);
    expect(() => parseSite({ info_cards: Array.from({ length: 7 }, () => ({ title: "x" })) })).toThrow(/6/);
  });

  it("stops very long websites before the database limit", () => {
    const long = "ಕ".repeat(800);
    expect(() => parseSite({
      story: Array.from({ length: 8 }, () => ({ title: "t", when: "", text: long.slice(0, 600) })),
      faqs: Array.from({ length: 12 }, () => ({ question: long.slice(0, 160), answer: long })),
      info_cards: Array.from({ length: 6 }, () => ({ title: "t", text: long.slice(0, 500), phone: "" })),
      closing: { title: "", names: Array.from({ length: 16 }, () => long.slice(0, 80)) },
    })).toThrow(/too long/);
  });
});

describe("preview data", () => {
  const fn = previewFunction({ id: FUNCTION_A, name: "Muhurtham", function_date: "2027-01-10", start_time: "10:30:00", venue_name: "Hall", status: "confirmed" }, "Asia/Kolkata");
  const data = buildPreviewData({
    coupleNames: ["Meera", "Ravi"], guestName: "Guest name", language: "kn", functions: [fn],
    design: { theme: "kolam", accent: null, texts: { kn: { heading: "ಸ್ವಾಗತ" }, en: { heading: "Welcome" } }, show_monogram: true, photo_url: null, site: { hashtag: "#MeeraRavi" } },
  });

  it("is a preview with a sample guest invited to every given function and no replies", () => {
    expect(data.preview).toEqual({ expires_at: null });
    expect(data.people).toHaveLength(1);
    expect(data.people[0]!.invitations.map((row) => [row.function.name, row.response])).toEqual([["Muhurtham", null]]);
    expect(data.blessings).toEqual([]);
    expect(fn).toMatchObject({ timezone: "Asia/Kolkata", location: "Hall", status: "confirmed", dress_code: null });
  });

  it("carries the couple's wording for every language and the draft website", () => {
    expect(data.invitation!.texts).toEqual({ heading: "ಸ್ವಾಗತ" });
    expect(data.invitation!.all_texts).toEqual({ kn: { heading: "ಸ್ವಾಗತ" }, en: { heading: "Welcome" } });
    expect(readSite(data.site).hashtag).toBe("#MeeraRavi");
  });

  it("has preview wording in every language", () => {
    for (const strings of Object.values(PORTAL_STRINGS)) {
      expect(strings.previewBanner).toBeTruthy();
      expect(strings.previewUntil("10:30")).toContain("10:30");
      expect(strings.infoTitle && strings.closingTitle && strings.revealTitle).toBeTruthy();
    }
  });
});

describe("family preview links in the database", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  afterEach(async () => { await db?.close(); });
  const digest = (c: string) => c.repeat(64);

  async function setup() {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const design = (await db.query<{ id: string }>("insert into public.invitation_designs(wedding_id,name,theme,created_by_user_id,updated_by_user_id,site) values($1,'TEST preview','veena',$2,$2,$3::jsonb) returning id", [WEDDING_A, OWNER_A, JSON.stringify({ hashtag: "#TestWedding" })])).rows[0]!.id;
    return design;
  }

  it("lets guest-list editors create a 30-minute link that shows the design and functions, not guests", async () => {
    const design = await setup();
    const expires = (await db.query<{ e: string }>("select public.create_invitation_preview_link($1,$2,$3) e", [WEDDING_A, design, digest("d")])).rows[0]!.e;
    const minutes = (new Date(expires).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29); expect(minutes).toBeLessThanOrEqual(30.1);
    await expectDenied(db.query("select * from public.invitation_preview_links"));
    await expectDenied(db.query("select public.get_invitation_preview($1)", [digest("d")]));

    await assumeUser(db, null, "anon");
    const preview = (await db.query<{ p: { design: { site: { hashtag: string }; theme: string }; functions: Array<{ id: string }>; couple_names: string[] } & Record<string, unknown> }>("select public.get_invitation_preview($1) p", [digest("d")])).rows[0]!.p;
    expect(preview.design.theme).toBe("veena");
    expect(preview.design.site.hashtag).toBe("#TestWedding");
    expect(preview.functions.map((fn) => fn.id)).toContain(FUNCTION_A);
    expect(Object.keys(preview).sort()).toEqual(["couple_names", "design", "expires_at", "functions"]);
    expect(JSON.stringify(preview)).not.toMatch(/full_name|email|phone/);
    expect((await db.query<{ p: unknown }>("select public.get_invitation_preview($1) p", [digest("e")])).rows[0]!.p).toBeNull();
    expect((await db.query<{ p: unknown }>("select public.get_invitation_preview($1) p", ["not-a-digest"])).rows[0]!.p).toBeNull();
    await expectDenied(db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, design, digest("f")]));
    await expectDenied(db.query("select * from public.invitation_preview_links"));
  });

  it("stops working after it expires", async () => {
    const design = await setup();
    await db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, design, digest("d")]);
    await db.query("reset role");
    await db.query("update public.invitation_preview_links set expires_at = now() - interval '1 second'");
    await assumeUser(db, null, "anon");
    expect((await db.query<{ p: unknown }>("select public.get_invitation_preview($1) p", [digest("d")])).rows[0]!.p).toBeNull();
  });

  it("refuses people without guest edit access, other weddings' designs and bad digests", async () => {
    const design = await setup();
    await assumeUser(db, SCOPED);
    await expectDenied(db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, design, digest("d")]), /edit access/);
    await assumeUser(db, OWNER_B);
    await expectDenied(db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, design, digest("d")]), /edit access/);
    await assumeUser(db, OWNER_A);
    await expectDenied(db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, design, "short"]), /Invalid/);
    await expectDenied(db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, "c0000000-0000-4000-8000-000000000009", digest("d")]), /no longer exists/);
  });

  it("saves the card and the website together in one versioned update", async () => {
    const design = await setup();
    const site = parseSite({ hashtag: "#Saved", parents: { one: "D/o Test", two: "" } });
    const saved = await db.query<{ version: number }>("update public.invitation_designs set name='TEST saved',theme='kolam',accent=null,texts=$3::jsonb,show_monogram=false,site=$4::jsonb where wedding_id=$1 and id=$2 and version=1 returning version", [WEDDING_A, design, JSON.stringify({ en: { heading: "Hi" } }), JSON.stringify(site)]);
    expect(saved.rows[0]!.version).toBe(2);
    const stale = await db.query("update public.invitation_designs set site='{}'::jsonb where wedding_id=$1 and id=$2 and version=1 returning id", [WEDDING_A, design]);
    expect(stale.rows).toHaveLength(0);
    await assumeUser(db, SCOPED);
    expect((await db.query("update public.invitation_designs set site='{}'::jsonb where id=$1 returning id", [design])).rows).toHaveLength(0);
  });

  it("limits open preview links per wedding", async () => {
    const design = await setup();
    for (let i = 0; i < 20; i += 1) await db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, design, i.toString(16).padStart(2, "0").repeat(32)]);
    await expectDenied(db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, design, digest("f")]), /Too many/);
  });
});
