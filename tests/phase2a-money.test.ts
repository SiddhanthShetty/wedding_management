import { describe, expect, it } from "vitest";
import { callLink, latestQuoteTotal, needsBudgetEntry, VENDOR_CATEGORIES, whatsAppLink } from "../src/lib/planning/vendor-rules";
import { budgetHeadline, whoWeOwe, type OweBooking, type OweInstalment } from "../src/lib/planning/owe";
import { bookingInput, transactionInput } from "../src/lib/planning/finance-inputs";

describe("vendor cards", () => {
  it("offers the usual Indian wedding categories", () => {
    expect(VENDOR_CATEGORIES).toContain("Caterer");
    expect(VENDOR_CATEGORIES).toContain("Pandit / purohit");
    expect(new Set(VENDOR_CATEGORIES).size).toBe(VENDOR_CATEGORIES.length);
  });
  it("makes WhatsApp links, treating 10-digit numbers as Indian", () => {
    expect(whatsAppLink("98450 12345")).toBe("https://wa.me/919845012345");
    expect(whatsAppLink("098450-12345")).toBe("https://wa.me/919845012345");
    expect(whatsAppLink("+91 98450 12345")).toBe("https://wa.me/919845012345");
    expect(whatsAppLink("+353 85 123 4567")).toBe("https://wa.me/353851234567");
    expect(whatsAppLink("0044 7700 900123")).toBe("https://wa.me/447700900123");
    expect(whatsAppLink("")).toBeNull();
    expect(whatsAppLink("call me")).toBeNull();
  });
  it("makes call links from whatever was typed", () => {
    expect(callLink("+91 98450 12345")).toBe("tel:+919845012345");
    expect(callLink("0824 2412345")).toBe("tel:08242412345");
    expect(callLink("n/a")).toBeNull();
  });
  it("shows the newest quote that has a total", () => {
    expect(latestQuoteTotal([{ version_number: 1, total_amount: 100000, currency: "INR" }, { version_number: 2, total_amount: 120000, currency: "INR" }, { version_number: 3, total_amount: null, currency: "INR" }])).toEqual({ amount: 120000, currency: "INR" });
    expect(latestQuoteTotal([])).toBeNull();
  });
  it("asks to add booked or selected vendors to the budget only once", () => {
    const inBudget = new Set(["v2"]);
    expect(needsBudgetEntry({ id: "v1", status: "booked" }, inBudget)).toBe(true);
    expect(needsBudgetEntry({ id: "v3", status: "selected" }, inBudget)).toBe(true);
    expect(needsBudgetEntry({ id: "v2", status: "booked" }, inBudget)).toBe(false);
    expect(needsBudgetEntry({ id: "v4", status: "shortlisted" }, inBudget)).toBe(false);
  });
  it("sends a valid booking when a vendor is added to the budget in one tap", () => {
    // The card sends one wedding-wide split equal to the price, which the booking rules require.
    const parsed = bookingInput.safeParse({ supplierId: "a0000000-0000-4000-8000-000000000009", sourceEstimateId: "", category: "Caterer", label: "SAMPLE Caterer", amount: "150000.00", currency: "INR", status: "confirmed", allocations: [{ functionId: "", amount: "150000.00" }] });
    expect(parsed.success).toBe(true);
  });
});

describe("who we still owe", () => {
  const bookings: OweBooking[] = [
    { id: "b1", label: "Caterer", supplier_name: "SAMPLE Caterers · Caterer", status: "confirmed", currency: "INR", balance: "100000.00" },
    { id: "b2", label: "Hall", supplier_name: "SAMPLE Hall · Venue", status: "confirmed", currency: "INR", balance: "50000.00" },
    { id: "b3", label: "Decor", supplier_name: "No supplier selected", status: "tentative", currency: "INR", balance: "20000.00" },
    { id: "b4", label: "Band", supplier_name: "SAMPLE Band", status: "confirmed", currency: "INR", balance: "0.00" },
    { id: "b5", label: "Cancelled DJ", supplier_name: "SAMPLE DJ", status: "cancelled", currency: "INR", balance: "30000.00" },
  ];
  const instalments: OweInstalment[] = [
    { id: "o1", booking_id: "b1", label: "Advance", due_date: "2027-03-01", remaining: "40000.00" },
    { id: "o2", booking_id: "b1", label: "Final", due_date: "2027-11-20", remaining: "60000.00" },
    { id: "o3", booking_id: "b2", label: "Deposit", due_date: "2026-12-01", remaining: "80000.00" },
  ];
  const rows = whoWeOwe(bookings, instalments, "2027-01-10");

  it("lists only bookings with money left, overdue first, then by the next due date", () => {
    expect(rows.map((row) => row.bookingId)).toEqual(["b2", "b1", "b3"]);
    expect(rows[0].overdue).toBe(true);
    expect(rows[1].next?.id).toBe("o1");
  });
  it("marks the next instalment paid, never more than the booking's balance", () => {
    expect(rows.find((row) => row.bookingId === "b1")).toMatchObject({ payNow: "40000.00", payNowObligationId: "o1" });
    expect(rows.find((row) => row.bookingId === "b2")).toMatchObject({ payNow: "50000.00", payNowObligationId: "o3" });
    expect(rows.find((row) => row.bookingId === "b3")).toMatchObject({ payNow: "20000.00", payNowObligationId: null, next: null });
  });
  it("records 'Mark paid' as a valid payment", () => {
    const row = rows[1];
    expect(transactionInput.safeParse({ bookingId: "a0000000-0000-4000-8000-000000000009", kind: "payment", amount: row.payNow, currency: "INR", date: "2027-01-10", payer: "", obligationId: "a0000000-0000-4000-8000-00000000000a", idempotencyKey: "a0000000-0000-4000-8000-00000000000b", note: "", contributions: [] }).success).toBe(true);
  });
});

describe("budget headline", () => {
  const total = { currency: "INR", budget: "1500000.00", forecast: "1200000.00", committed: "900000.00", netPaid: "300000.00", outstanding: "600000.00" };
  it("shows budget, booked and still to pay, with what's left", () => {
    expect(budgetHeadline(total)).toEqual({ currency: "INR", budget: "1500000.00", booked: "900000.00", paid: "300000.00", stillToPay: "600000.00", leftInBudget: "300000.00" });
  });
  it("shows a negative amount left when expected costs pass the budget, and nothing without a budget", () => {
    expect(budgetHeadline({ ...total, forecast: "1650000.50" }).leftInBudget).toBe("-150000.50");
    expect(budgetHeadline({ ...total, budget: null }).leftInBudget).toBeNull();
  });
});
