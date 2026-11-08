/**
 * The simple reply page: what guests see when a design's guest page style is "simple" (the default).
 * It keeps everything needed to reply (card or artwork, plan, replies, travel, guest information, the
 * link to an invitation website made elsewhere) and leaves out the invitation-website extras. Nothing
 * is deleted: choosing "full" shows the saved extras again.
 */
import type { GuestPortalData } from "@/lib/guest-portal/server";
import { readSite, type InvitationSite } from "@/lib/invitations/site";

export function simpleSite(site: InvitationSite): InvitationSite {
  return {
    ...site,
    template: "classic", opening_animation: false, effect: "petals", livestream_url: null,
    story: [], faqs: [], palettes: {}, blessings_enabled: false,
    closing: { title: "", names: [] }, hashtag: "", instagram: [],
    reveal: { title: "", hint: "" }, titles: { story: "", info: "", faq: "", blessings: "" },
  };
}

/** The guest page data as this design's page style shows it. */
export function pageView(data: GuestPortalData): GuestPortalData {
  const site = readSite(data.site);
  if (site.page_style === "full") return data;
  return {
    ...data,
    site: simpleSite(site),
    blessings: [], my_pending_blessings: 0,
    media: data.media ? { ...data.media, music: null, gallery: [] } : data.media,
  };
}
