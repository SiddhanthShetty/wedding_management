import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/invitations" }));
vi.mock("@/app/actions/invitations", () => Object.fromEntries(["captionMediaAction", "deleteMediaAction", "createPreviewLinkAction", "prepareInvitationAction", "recordInvitationSharedAction", "saveDesignAction", "saveDesignPhotoAction", "setDefaultDesignAction", "moderateBlessingAction"].map((name) => [name, vi.fn()])));
vi.mock("@/app/actions/bulk", () => ({ createMissingLinksAction: vi.fn() }));

const data = {
  wedding: { id: "a0000000-0000-4000-8000-000000000001", name: "SAMPLE", timezone: "Asia/Kolkata", currency: "INR" },
  canEdit: true, coupleNames: "Swee & Sid", media: [], weddingDate: "2027-12-03", couplePartners: ["Swee", "Sid"],
  designs: [], households: [], guests: [], invitations: [], functions: [], sent: [], linkActivity: {}, blessings: [],
};

describe("Save the Date in the simple studio", () => {
  it("offers Invitation or Save the Date on the Card step without the full studio", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { InvitationStudio } = await import("../src/components/invitation-studio");
    // A first-time couple starts on the Card step in the simple studio.
    const markup = renderToStaticMarkup(createElement(InvitationStudio, { data: data as never }));
    expect(markup).toContain("What are you sending?");
    expect(markup).toContain("Save the Date");
    expect(markup).toContain("Sending a Save the Date months ahead?");
    expect(markup).not.toContain("Page template");
  });
});
