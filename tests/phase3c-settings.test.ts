import { describe, expect, it } from "vitest";
import { accessSummary, DEFAULT_ACCESS, needsPartner, PLAIN_ROLES, partnerInviteMessage, roleName } from "../src/lib/roles";

describe("plain roles", () => {
  it("calls owners and co-owners Partner, and names helpers plainly", () => {
    expect(roleName("owner")).toBe("Partner");
    expect(roleName("co_owner")).toBe("Partner");
    expect(roleName("scoped_collaborator")).toBe("Family helper");
    expect(roleName("read_only_collaborator")).toBe("View only");
  });
  it("offers three choices that map to the database roles", () => {
    expect(PLAIN_ROLES.map((item) => [item.name, item.role])).toEqual([["Partner", "co_owner"], ["Family helper", "scoped_collaborator"], ["View only", "read_only_collaborator"]]);
  });
  it("never starts a view-only person with change access", () => {
    expect(Object.values(DEFAULT_ACCESS.view)).not.toContain("edit");
    expect(DEFAULT_ACCESS.helper.suppliers_finance).toBe("none");
  });
  it("sums up what someone can do in plain words", () => {
    expect(accessSummary("co_owner", {})).toBe("Everything");
    expect(accessSummary("scoped_collaborator", { planning: "edit", guests: "edit", logistics: "read" })).toBe("Can change: Plan, Guests · Can see: Wedding week");
    expect(accessSummary("read_only_collaborator", {})).toBe("Nothing yet");
  });
});

describe("invite your partner", () => {
  it("shows until a second partner is active", () => {
    expect(needsPartner([{ role: "owner", status: "active" }])).toBe(true);
    expect(needsPartner([{ role: "owner", status: "active" }, { role: "scoped_collaborator", status: "active" }])).toBe(true);
    expect(needsPartner([{ role: "owner", status: "active" }, { role: "co_owner", status: "revoked" }])).toBe(true);
    expect(needsPartner([{ role: "owner", status: "active" }, { role: "co_owner", status: "active" }])).toBe(false);
  });
  it("writes a message with the sign-up link and a warning not to set up a second wedding", () => {
    const message = partnerInviteMessage("https://example.test/sign-up", "Siddhanth");
    expect(message).toContain("https://example.test/sign-up");
    expect(message).toContain("Don't set up a new wedding");
    expect(message).toContain("Siddhanth");
  });
});
