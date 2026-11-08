import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checkMedia, MAX_ARTWORK_BYTES } from "../src/lib/invitations/media";
import { parseSite, readSite } from "../src/lib/invitations/site";
import { artworkOf, buildCardProps } from "../src/lib/invitations/card-data";
import { InvitationCard } from "../src/components/invitation-card";
import { PdfPages, pdfContent } from "../src/components/invitation-pdf";
import { PORTAL_STRINGS } from "../src/lib/guest-portal/i18n";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, WEDDING_A, testHousehold } from "./support/database";

const functions = [{ id: "f1", name: "Muhurtham", function_date: "2026-12-03", start_time: "10:30", venue_name: "Hall" }, { id: "f2", name: "Reception", function_date: "2026-12-03", start_time: "19:00", venue_name: "Hall" }];
const card = (artwork: ReturnType<typeof artworkOf>) => buildCardProps({ theme: "mallige", accent: null, overrides: {}, language: "kn", couple: "Sweekruti & Siddhanth", greetingName: "Asha", functions, artwork });

describe("own artwork and outside invitation link: settings", () => {
  it("defaults to the drawn card and no link, and validates the link", () => {
    expect(readSite({}).artwork).toEqual({ enabled: false, name_band: "bottom" });
    expect(readSite({}).external_link).toEqual({ url: null, label: "" });
    expect(parseSite({ artwork: { enabled: true, name_band: "top" }, external_link: { url: "https://example.com/our-invite", label: "Our website" } })).toMatchObject({ artwork: { enabled: true, name_band: "top" }, external_link: { url: "https://example.com/our-invite" } });
    expect(parseSite({ external_link: { url: "", label: "" } }).external_link.url).toBeNull();
    expect(() => parseSite({ external_link: { url: "http://example.com", label: "" } })).toThrow(/https/);
    expect(() => parseSite({ external_link: { url: "javascript:alert(1)", label: "" } })).toThrow();
    expect(parseSite({ artwork: { enabled: true, name_band: "sideways" } }).artwork.name_band).toBe("bottom");
  });
  it("uses the artwork only when it is switched on and uploaded", () => {
    const on = parseSite({ artwork: { enabled: true, name_band: "none" } });
    expect(artworkOf(on, "/guest/media/x")).toEqual({ url: "/guest/media/x", nameBand: "none" });
    expect(artworkOf(on, null)).toBeNull();
    expect(artworkOf(parseSite({}), "/guest/media/x")).toBeNull();
  });
  it("accepts larger artwork images than gallery photos, but only images", () => {
    const big = new Uint8Array(900_000); big.set([0xff, 0xd8, 0xff]);
    expect(checkMedia("artwork", big)).toEqual({ mime: "image/jpeg" });
    expect(checkMedia("gallery", big)).toEqual({ error: expect.stringMatching(/too large/) });
    const huge = new Uint8Array(MAX_ARTWORK_BYTES + 1); huge.set([0xff, 0xd8, 0xff]);
    expect(checkMedia("artwork", huge)).toEqual({ error: expect.stringMatching(/too large/) });
    const pdf = new Uint8Array(32); pdf.set([...("%PDF-1.7")].map((c) => c.charCodeAt(0)));
    expect(checkMedia("artwork", pdf)).toEqual({ error: expect.stringMatching(/JPEG or PNG/) });
  });
  it("has the outside-link wording in every language", () => {
    for (const strings of Object.values(PORTAL_STRINGS)) expect(strings.fullInvitation && strings.replyHere).toBeTruthy();
  });
});

describe("own artwork on the card and in the PDF", () => {
  it("draws the artwork whole, with the guest's greeting in a band", () => {
    const svg = renderToStaticMarkup(createElement(InvitationCard, card({ url: "/guest/media/abc", nameBand: "bottom" })));
    expect(svg).toContain('href="/guest/media/abc"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain("ಆತ್ಮೀಯ Asha,");
    expect(svg).not.toContain("Muhurtham");
    const plain = renderToStaticMarkup(createElement(InvitationCard, card({ url: "/guest/media/abc", nameBand: "none" })));
    expect(plain).not.toContain("Asha");
  });
  it("makes the artwork the first PDF page, with the QR code, then each function and the closing page", () => {
    const html = renderToStaticMarkup(createElement(PdfPages, { content: pdfContent({ card: card({ url: "/guest/media/abc", nameBand: "bottom" }), language: "en", site: parseSite({ artwork: { enabled: true, name_band: "bottom" } }), partners: ["Sweekruti", "Siddhanth"], functions, qr: { size: 21, d: "M0 0h1v1H0z" } }) }));
    expect(html.match(/<svg[^>]*viewBox="0 0 1748 2480"/g)).toHaveLength(4);
    expect(html.indexOf('href="/guest/media/abc"')).toBeLessThan(html.indexOf("Muhurtham"));
    expect(html).not.toContain("WEDDING INVITATION"); // no drawn cover
  });
});

describe("own artwork in the database", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  afterEach(async () => { await db?.close(); });
  const jpeg = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(Math.max(0, bytes - 3))]).toString("base64");

  it("keeps one artwork per design up to 1.3 MB and lists it for the guest's session", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const household = await testHousehold(db, WEDDING_A, "TEST Artwork family");
    const guest = (await db.query<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household, full_name: "Asha Rao", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).rows[0]!.id;
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest, FUNCTION_A]);
    const design = (await db.query<{ id: string }>("insert into public.invitation_designs(wedding_id,name,theme,created_by_user_id,updated_by_user_id) values($1,'TEST art','veena',$2,$2) returning id", [WEDDING_A, OWNER_A])).rows[0]!.id;
    await db.query("select public.set_default_invitation_design($1,$2)", [WEDDING_A, design]);
    const insert = (bytes: number, position = 0) => db.query<{ id: string }>("insert into public.invitation_media(wedding_id,design_id,kind,position,mime,data,byte_size,created_by_user_id) values($1,$2,'artwork',$3,'image/jpeg',$4,$5,$6) returning id", [WEDDING_A, design, position, jpeg(bytes), bytes, OWNER_A]);
    const art = (await insert(900_000)).rows[0]!.id;
    await expectDenied(insert(1000), /duplicate|unique/);
    await db.query("delete from public.invitation_media where id=$1", [art]);
    await expectDenied(insert(1_300_001), /check/);
    await expectDenied(insert(1000, 1), /check/);
    const kept = (await insert(1000)).rows[0]!.id;
    await db.query("select public.create_guest_portal_link($1,$2,$3::uuid[],$4,$5::timestamptz)", [WEDDING_A, guest, [], "a".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    await assumeUser(db, null, "anon");
    await db.query("select public.create_guest_portal_session($1,$2)", ["a".repeat(64), "b".repeat(64)]);
    const listing = (await db.query<{ m: { artwork: string } }>("select public.list_guest_portal_media($1) m", ["b".repeat(64)])).rows[0]!.m;
    expect(listing.artwork).toBe(kept);
    expect((await db.query<{ f: { mime: string } }>("select public.get_guest_portal_media($1,$2) f", ["b".repeat(64), kept])).rows[0]!.f.mime).toBe("image/jpeg");
  });
});
