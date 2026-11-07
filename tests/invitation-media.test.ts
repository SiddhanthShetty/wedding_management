import { afterEach, describe, expect, it } from "vitest";
import { checkMedia, MAX_MUSIC_BYTES, sniffMedia } from "../src/lib/invitations/media";
import { EMPTY_SITE, parseSite, readSite } from "../src/lib/invitations/site";
import { PORTAL_STRINGS } from "../src/lib/guest-portal/i18n";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, OWNER_B, SCOPED, WEDDING_A, testHousehold } from "./support/database";

const bytes = (...values: number[]) => { const out = new Uint8Array(Math.max(16, values.length)); out.set(values); return out; };
const text = (value: string, offset = 0, size = 16) => { const out = new Uint8Array(size); [...value].forEach((char, i) => { out[offset + i] = char.charCodeAt(0); }); return out; };

describe("media file checks", () => {
  it("recognises allowed files by their first bytes, not their name", () => {
    expect(sniffMedia(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    const webp = text("RIFF"); webp.set(text("WEBP").slice(0, 4), 8); expect(sniffMedia(webp)).toBe("image/webp");
    expect(sniffMedia(text("ID3"))).toBe("audio/mpeg");
    expect(sniffMedia(bytes(0xff, 0xfb, 0x90, 0x00))).toBe("audio/mpeg");
    const m4a = new Uint8Array(16); m4a.set(text("ftypM4A ").slice(0, 8), 4); expect(sniffMedia(m4a)).toBe("audio/mp4");
    expect(sniffMedia(text("OggS"))).toBe("audio/ogg");
    expect(sniffMedia(text("<svg onload=x>"))).toBeNull();
    expect(sniffMedia(text("%PDF-1.7"))).toBeNull();
    expect(sniffMedia(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull(); // PNG must be resized to JPEG first
  });

  it("keeps music and photos to their own kinds and sizes", () => {
    expect(checkMedia("music", text("ID3"))).toEqual({ mime: "audio/mpeg" });
    expect(checkMedia("music", bytes(0xff, 0xd8, 0xff))).toEqual({ error: expect.stringMatching(/MP3/) });
    expect(checkMedia("gallery", text("ID3"))).toEqual({ error: expect.stringMatching(/JPEG/) });
    const big = new Uint8Array(MAX_MUSIC_BYTES + 1); big.set(text("ID3").slice(0, 3));
    expect(checkMedia("music", big)).toEqual({ error: expect.stringMatching(/1\.5 MB/) });
    const photo = new Uint8Array(460_000); photo.set([0xff, 0xd8, 0xff]);
    expect(checkMedia("gallery", photo)).toEqual({ error: expect.stringMatching(/too large/) });
  });
});

describe("template, opening and effect choices", () => {
  it("defaults older websites and falls back on unknown values", () => {
    expect(readSite({}).template).toBe("classic");
    expect(EMPTY_SITE).toMatchObject({ template: "classic", opening_style: "envelope", effect: "petals" });
    expect(parseSite({ template: "kacheri", opening_style: "doors", effect: "confetti" })).toMatchObject({ template: "kacheri", opening_style: "doors", effect: "confetti" });
    expect(parseSite({ template: "<script>", opening_style: 7, effect: "fireworks" })).toMatchObject({ template: "classic", opening_style: "envelope", effect: "petals" });
  });
  it("has music and gallery wording in every language", () => {
    for (const strings of Object.values(PORTAL_STRINGS)) {
      expect(strings.playMusic && strings.pauseMusic && strings.galleryTitle && strings.close).toBeTruthy();
      expect(strings.photoOf(2, 8)).toMatch(/2.*8/);
    }
  });
});

describe("invitation media in the database", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  afterEach(async () => { await db?.close(); });
  const b64 = (prefix: number[]) => Buffer.from(Uint8Array.from([...prefix, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toString("base64");
  const insert = (design: string, kind: string, position: number, mime: string, size = 12) =>
    db.query<{ id: string }>("insert into public.invitation_media(wedding_id,design_id,kind,position,mime,data,byte_size,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
      [WEDDING_A, design, kind, position, mime, b64(mime.startsWith("audio") ? [0x49, 0x44, 0x33] : [0xff, 0xd8, 0xff]), size, OWNER_A]);

  async function setup() {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const household = await testHousehold(db, WEDDING_A, "TEST Media family");
    const guest = (await db.query<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household, full_name: "Asha Rao", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).rows[0]!.id;
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest, FUNCTION_A]);
    const design = (await db.query<{ id: string }>("insert into public.invitation_designs(wedding_id,name,theme,created_by_user_id,updated_by_user_id) values($1,'TEST media','veena',$2,$2) returning id", [WEDDING_A, OWNER_A])).rows[0]!.id;
    const other = (await db.query<{ id: string }>("insert into public.invitation_designs(wedding_id,name,theme,created_by_user_id,updated_by_user_id) values($1,'TEST other','kolam',$2,$2) returning id", [WEDDING_A, OWNER_A])).rows[0]!.id;
    await db.query("select public.set_default_invitation_design($1,$2)", [WEDDING_A, design]);
    await db.query("select public.create_guest_portal_link($1,$2,$3::uuid[],$4,$5::timestamptz)", [WEDDING_A, guest, [], "a".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    return { design, other };
  }

  it("lets guest-list editors add media and keeps the limits in the database", async () => {
    const { design } = await setup();
    const music = (await insert(design, "music", 0, "audio/mpeg")).rows[0]!.id;
    await expectDenied(insert(design, "music", 0, "audio/mpeg"), /duplicate|unique/);
    await expectDenied(insert(design, "music", 1, "audio/mpeg"), /check/);
    await expectDenied(insert(design, "gallery", 0, "audio/mpeg"), /check/);
    await expectDenied(insert(design, "gallery", 0, "image/jpeg", 470_000), /check/);
    await expectDenied(insert(design, "gallery", 8, "image/jpeg"), /check/);
    await expectDenied(insert(design, "gallery", 0, "image/svg+xml"), /check/);
    for (let i = 0; i < 8; i += 1) await insert(design, "gallery", i, "image/jpeg");
    await expectDenied(insert(design, "gallery", 3, "image/jpeg"), /duplicate|unique/);
    await expectDenied(db.query("update public.invitation_media set data='AAAA' where id=$1", [music]), /permission denied/);
    expect((await db.query("update public.invitation_media set caption='Mehendi night' where id=$1 returning id", [music])).rows).toHaveLength(1);

    await assumeUser(db, SCOPED);
    expect((await db.query("select id from public.invitation_media")).rows).toHaveLength(0);
    await expectDenied(insert(design, "gallery", 0, "image/jpeg"));
    await assumeUser(db, OWNER_B);
    expect((await db.query("delete from public.invitation_media returning id")).rows).toHaveLength(0);
    await assumeUser(db, null, "anon");
    await expectDenied(db.query("select id from public.invitation_media"));
  });

  it("gives guests only the media of the design they see, through their own session", async () => {
    const { design, other } = await setup();
    const music = (await insert(design, "music", 0, "audio/mpeg")).rows[0]!.id;
    const photo = (await insert(design, "gallery", 0, "image/jpeg")).rows[0]!.id;
    const hidden = (await insert(other, "gallery", 0, "image/jpeg")).rows[0]!.id;
    await assumeUser(db, null, "anon");
    await db.query("select public.create_guest_portal_session($1,$2)", ["a".repeat(64), "b".repeat(64)]);
    const listing = (await db.query<{ m: { music: string; gallery: Array<{ id: string }> } }>("select public.list_guest_portal_media($1) m", ["b".repeat(64)])).rows[0]!.m;
    expect(listing.music).toBe(music);
    expect(listing.gallery.map((row) => row.id)).toEqual([photo]);
    const file = (await db.query<{ f: { mime: string; data: string } }>("select public.get_guest_portal_media($1,$2) f", ["b".repeat(64), photo])).rows[0]!.f;
    expect(file.mime).toBe("image/jpeg");
    expect(Buffer.from(file.data, "base64")[0]).toBe(0xff);
    expect((await db.query<{ f: unknown }>("select public.get_guest_portal_media($1,$2) f", ["b".repeat(64), hidden])).rows[0]!.f).toBeNull();
    expect((await db.query<{ m: unknown }>("select public.list_guest_portal_media($1) m", ["c".repeat(64)])).rows[0]!.m).toBeNull();
    expect((await db.query<{ f: unknown }>("select public.get_guest_portal_media($1,$2) f", ["bad", photo])).rows[0]!.f).toBeNull();
    await assumeUser(db, OWNER_A);
    await expectDenied(db.query("select public.get_guest_portal_media($1,$2)", ["b".repeat(64), photo]));
  });

  it("gives family previews the media of the previewed design until the link expires", async () => {
    const { other } = await setup();
    const photo = (await insert(other, "gallery", 0, "image/jpeg")).rows[0]!.id;
    await db.query("select public.create_invitation_preview_link($1,$2,$3)", [WEDDING_A, other, "d".repeat(64)]);
    await assumeUser(db, null, "anon");
    const listing = (await db.query<{ m: { music: unknown; gallery: Array<{ id: string }> } }>("select public.list_invitation_preview_media($1) m", ["d".repeat(64)])).rows[0]!.m;
    expect(listing).toEqual({ music: null, gallery: [{ id: photo, caption: "" }] });
    expect((await db.query<{ f: { mime: string } }>("select public.get_invitation_preview_media($1,$2) f", ["d".repeat(64), photo])).rows[0]!.f.mime).toBe("image/jpeg");
    await db.query("reset role");
    await db.query("update public.invitation_preview_links set expires_at=now()-interval '1 second'");
    await assumeUser(db, null, "anon");
    expect((await db.query<{ f: unknown }>("select public.get_invitation_preview_media($1,$2) f", ["d".repeat(64), photo])).rows[0]!.f).toBeNull();
    expect((await db.query<{ m: unknown }>("select public.list_invitation_preview_media($1) m", ["d".repeat(64)])).rows[0]!.m).toBeNull();
  });

  it("deletes a design's media with the design", async () => {
    const { other } = await setup();
    await insert(other, "gallery", 0, "image/jpeg");
    await db.query("reset role");
    await db.query("delete from public.invitation_designs where id=$1", [other]);
    expect((await db.query("select id from public.invitation_media where design_id=$1", [other])).rows).toHaveLength(0);
  });
});
