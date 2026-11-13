import { describe, expect, it } from "vitest";
import { percent, trackInvites } from "../src/lib/invitations/tracking";
import { READY_MESSAGES, reminderPlan } from "../src/lib/planning/reminder-plan";
import { MESSAGE_STATE_LABELS, PLACEHOLDERS, unknownPlaceholders } from "../src/lib/planning/communications";

describe("invite and track", () => {
  const invitations = [
    { id: "i1", guest_id: "g1", function_id: "f1" }, { id: "i2", guest_id: "g1", function_id: "f2" },
    { id: "i3", guest_id: "g2", function_id: "f1" }, { id: "i4", guest_id: "g3", function_id: "f2" },
  ];
  const summary = trackInvites(["g1", "g2", "g3"], new Set(["g1", "g2"]), new Set(["g1"]), invitations, new Set(["i1", "i3"]));

  it("counts invited, sent, opened and fully replied guests", () => {
    expect([summary.invited, summary.sent, summary.opened, summary.replied]).toEqual([3, 2, 1, 1]);
    expect([...summary.repliedGuestIds]).toEqual(["g2"]);
  });
  it("counts who's still waiting for each function", () => {
    expect(summary.waiting).toEqual([{ functionId: "f2", waiting: 2 }]);
  });
  it("draws safe progress bars", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 3)).toBe(100);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("reminder plan", () => {
  it("counts back from the wedding and marks where you are", () => {
    const steps = reminderPlan("2027-12-03", "2027-11-10", "f1");
    expect(steps.map((step) => [step.key, step.date, step.state])).toEqual([
      ["invite", "2027-10-08", "done"], ["gentle", "2027-11-05", "now"], ["final", "2027-11-19", "upcoming"], ["directions", "2027-11-30", "upcoming"],
    ]);
    expect(steps[1].href).toBe("/messages?function=f1&kind=reminder");
  });
  it("needs a wedding date", () => {
    expect(reminderPlan(null, "2027-01-01", null)).toEqual([]);
  });
});

describe("ready-made messages", () => {
  it("only use placeholders the app knows", () => {
    for (const item of READY_MESSAGES) expect(unknownPlaceholders(`${item.subject}\n${item.body}`), item.key).toEqual([]);
    expect(PLACEHOLDERS).toContain("first_name");
  });
  it("never claim delivery for messages you sent yourself", () => {
    expect(MESSAGE_STATE_LABELS.sent).toBe("Sent by you");
    expect(MESSAGE_STATE_LABELS.failed).toBe("Didn't go through");
  });
});
