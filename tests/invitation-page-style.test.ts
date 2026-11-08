import { describe, expect, it } from "vitest";
import { pageView, simpleSite } from "../src/lib/invitations/page-style";
import { parseSite, readSite } from "../src/lib/invitations/site";
import { buildPreviewData, previewFunction } from "../src/lib/invitations/preview";
import type { GuestPortalData } from "../src/lib/guest-portal/server";

const richSite = parseSite({
  template: "kacheri", opening_animation: true, effect: "confetti", livestream_url: "https://example.com/live", countdown: true,
  story: [{ title: "We met", text: "", when: "2019" }], faqs: [{ question: "Parking?", answer: "Back gate." }], palettes: {}, blessings_enabled: true,
  closing: { title: "", names: ["Shetty family"] }, hashtag: "#SweeSid", instagram: ["swee"], reveal: { title: "Welcome", hint: "" },
  blessing_header: "|| Shree Ganeshaya Namah ||", parents: { one: "D/o Smt. Lakshmi", two: "" },
  info_cards: [{ title: "Getting there", text: "Udupi road", phone: "" }], external_link: { url: "https://our-invite.example.com", label: "" },
  artwork: { enabled: true, name_band: "bottom" },
});
const portal = (site: unknown): GuestPortalData => ({
  ...buildPreviewData({ coupleNames: ["Sweekruti", "Siddhanth"], guestName: "Asha", language: "en", functions: [previewFunction({ id: "f1", name: "Haldi", function_date: "2026-12-02", start_time: null, venue_name: null, status: "confirmed" }, "Asia/Kolkata")],
    design: { theme: "mallige", accent: null, texts: {}, show_monogram: true, photo_url: null, site } }),
  blessings: [{ name: "Asha", message: "Congratulations", created_at: "2026-11-08" }],
  media: { base: "/guest/media/", music: "m1", artwork: "a1", gallery: [{ id: "g1", caption: "" }] },
});

describe("guest page style", () => {
  it("is the simple reply page by default, including for designs saved before the setting existed", () => {
    expect(readSite({}).page_style).toBe("simple");
    expect(parseSite({ page_style: "full" }).page_style).toBe("full");
    expect(parseSite({ page_style: "fancy" }).page_style).toBe("simple");
  });

  it("leaves out the invitation-website extras on the simple page, without deleting them", () => {
    const view = pageView(portal(richSite));
    const site = readSite(view.site);
    expect(site).toMatchObject({ template: "classic", opening_animation: false, livestream_url: null, story: [], faqs: [], blessings_enabled: false, hashtag: "", instagram: [] });
    expect(site.closing.names).toEqual([]);
    expect(view.blessings).toEqual([]);
    expect(view.media).toMatchObject({ music: null, gallery: [], artwork: "a1" });
    // What guests need to reply stays.
    expect(site).toMatchObject({ countdown: true, blessing_header: "|| Shree Ganeshaya Namah ||", parents: { one: "D/o Smt. Lakshmi" }, external_link: { url: "https://our-invite.example.com" }, artwork: { enabled: true } });
    expect(site.info_cards).toHaveLength(1);
    expect(view.people[0]!.invitations.map((row) => row.function.name)).toEqual(["Haldi"]);
    // The saved design itself is untouched.
    expect(richSite.story).toHaveLength(1);
    expect(simpleSite(richSite).story).toEqual([]);
  });

  it("shows everything again when the design chooses the full invitation website", () => {
    const data = portal({ ...richSite, page_style: "full" });
    expect(pageView(data)).toBe(data);
  });
});
