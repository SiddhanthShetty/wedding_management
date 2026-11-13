import { describe, expect, it } from "vitest";
import { resolveResponsible, responsibleText } from "../src/lib/planning/responsible";

const members = [{ userId: "u1", name: "Siddhanth Shetty" }, { userId: "u2", name: "Sweekruti" }];

describe("Who's responsible", () => {
  it("links a member's name to their account, ignoring case and spacing", () => {
    expect(resolveResponsible("  siddhanth   shetty ", members)).toEqual({ owner_user_id: "u1", owner_name: "" });
  });
  it("keeps anyone else as the name typed", () => {
    expect(resolveResponsible("Venue coordinator", members)).toEqual({ owner_user_id: "", owner_name: "Venue coordinator" });
    expect(resolveResponsible("x".repeat(200), members).owner_name).toHaveLength(160);
  });
  it("leaves both empty when nobody is named", () => {
    expect(resolveResponsible("   ", members)).toEqual({ owner_user_id: "", owner_name: "" });
  });
  it("shows the current responsible person in the box", () => {
    expect(responsibleText({ owner_user_id: "u2", owner_name: "" }, members)).toBe("Sweekruti");
    expect(responsibleText({ owner_user_id: null, owner_name: "Ramesh mama" }, members)).toBe("Ramesh mama");
    expect(responsibleText(undefined, members)).toBe("");
  });
});
