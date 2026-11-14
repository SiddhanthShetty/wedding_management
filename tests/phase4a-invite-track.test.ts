import { describe, expect, it } from "vitest";
import { READY_MESSAGES, reminderPlan } from "../src/lib/planning/reminder-plan";
import { MESSAGE_STATE_LABELS, PLACEHOLDERS, unknownPlaceholders } from "../src/lib/planning/communications";

describe("reminder plan", () => {
  it("counts back from the wedding and marks where you are", () => {
    const steps = reminderPlan("2027-12-03", "2027-11-10");
    expect(steps.map((step) => [step.key, step.date, step.state])).toEqual([
      ["invite", "2027-10-08", "done"], ["gentle", "2027-11-05", "now"], ["final", "2027-11-19", "upcoming"], ["directions", "2027-11-30", "upcoming"],
    ]);
    expect(steps.map((step) => step.href)).toEqual(["/guests/simple#families", "/guests/simple#families", "/guests/simple#families", "/guests/simple#send-update"]);
  });
  it("needs a wedding date", () => {
    expect(reminderPlan(null, "2027-01-01")).toEqual([]);
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
