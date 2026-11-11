/**
 * "Who we still owe": every booking with money left to pay, with its next instalment.
 * Amounts are decimal strings, compared in minor units so nothing is lost to rounding.
 */
import { fromMinorUnits, toMinorUnits, toSignedMinorUnits } from "@/lib/planning/money";

export type OweBooking = { id: string; label: string; supplier_name: string; status: string; currency: string; balance: string };
export type OweInstalment = { id: string; booking_id: string; label: string; due_date: string; remaining: string };
export type OweRow = {
  bookingId: string; label: string; supplier: string; currency: string; balance: string;
  next: OweInstalment | null; overdue: boolean;
  /** What "Mark paid" records: the next instalment's remaining amount, or else the whole balance (never more than the balance). */
  payNow: string; payNowObligationId: string | null;
};

const positive = (value: string) => toSignedMinorUnits(value) > 0n;

export function whoWeOwe(bookings: OweBooking[], instalments: OweInstalment[], today: string): OweRow[] {
  return bookings
    .filter((booking) => booking.status !== "cancelled" && positive(booking.balance))
    .map((booking) => {
      const next = instalments
        .filter((item) => item.booking_id === booking.id && positive(item.remaining))
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
      const capped = next && toMinorUnits(next.remaining) <= toMinorUnits(booking.balance) ? next.remaining : booking.balance;
      return {
        bookingId: booking.id, label: booking.label, supplier: booking.supplier_name, currency: booking.currency, balance: booking.balance,
        next, overdue: Boolean(next && next.due_date < today),
        payNow: next ? capped : booking.balance, payNowObligationId: next?.id ?? null,
      };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue)
      || (a.next?.due_date ?? "9999-12-31").localeCompare(b.next?.due_date ?? "9999-12-31")
      || a.label.localeCompare(b.label));
}

export type Headline = { currency: string; budget: string | null; booked: string; paid: string; stillToPay: string; leftInBudget: string | null };

/** The three numbers at the top of the budget page, plus what's been paid and what's left in the budget after everything expected. */
export function budgetHeadline(total: { currency: string; budget: string | null; forecast: string; committed: string; netPaid: string; outstanding: string }): Headline {
  const left = total.budget === null ? null : fromMinorUnits(toSignedMinorUnits(total.budget) - toSignedMinorUnits(total.forecast));
  return { currency: total.currency, budget: total.budget, booked: total.committed, paid: total.netPaid, stillToPay: total.outstanding, leftInBudget: left };
}
