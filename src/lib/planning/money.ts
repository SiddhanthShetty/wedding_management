export const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export function toMinorUnits(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) throw new Error("Enter a non-negative amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function toSignedMinorUnits(value: string): bigint {
  return value.startsWith("-") ? -toMinorUnits(value.slice(1)) : toMinorUnits(value);
}

export function fromMinorUnits(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function sumMoney(values: string[]): string {
  return fromMinorUnits(values.reduce((sum, value) => sum + toMinorUnits(value), 0n));
}

export function subtractMoney(left: string, right: string): string {
  return fromMinorUnits(toMinorUnits(left) - toMinorUnits(right));
}

export function formatMoney(value: string, currency: string): string {
  const minor = toSignedMinorUnits(value);
  const absolute = minor < 0n ? -minor : minor;
  const whole = absolute / 100n;
  const grouped = new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(whole);
  return `${minor < 0n ? "−" : ""}${currency} ${grouped}.${String(absolute % 100n).padStart(2, "0")}`;
}

export type CurrencyTotal = { currency: string; budget: string | null; forecast: string; committed: string; netPaid: string; outstanding: string };
export type FinanceBooking = { status: "tentative" | "confirmed" | "cancelled"; amount: string; currency: string; paid: string };
export type FinanceEstimate = { status: "active" | "converted" | "void"; amount: string; currency: string };
export type FinanceAdjustment = { amount: string; currency: string };
export type FinanceTotalsInput = {
  budget: string | null;
  budgetCurrency: string;
  bookings: FinanceBooking[];
  estimates: FinanceEstimate[];
  adjustments: FinanceAdjustment[];
  payments: Array<{ amount: string; currency: string }>;
  refunds: Array<{ amount: string; currency: string }>;
};

/** Forecast = non-cancelled agreed bookings + active unbooked estimates + signed adjustments. */
export function calculateFinanceTotals(input: FinanceTotalsInput): CurrencyTotal[] {
  const currencies = new Set<string>([input.budgetCurrency, ...input.bookings.map((b) => b.currency), ...input.estimates.filter((e) => e.status === "active").map((e) => e.currency), ...input.adjustments.map((a) => a.currency), ...input.payments.map((p) => p.currency), ...input.refunds.map((r) => r.currency)]);
  return [...currencies].sort().map((currency) => {
    const budget = currency === input.budgetCurrency ? input.budget : null;
    const activeBookings = input.bookings.filter((b) => b.currency === currency && b.status !== "cancelled");
    const committed = sumMoney(activeBookings.filter((b) => b.status === "confirmed").map((b) => b.amount));
    const bookingForecast = sumMoney(activeBookings.map((b) => b.amount));
    const estimates = sumMoney(input.estimates.filter((e) => e.currency === currency && e.status === "active").map((e) => e.amount));
    const adjustments = input.adjustments.filter((a) => a.currency === currency).reduce((sum, a) => sum + toSignedMinorUnits(a.amount), 0n);
    const forecast = fromMinorUnits(toMinorUnits(bookingForecast) + toMinorUnits(estimates) + adjustments);
    const paid = sumMoney(input.payments.filter((p) => p.currency === currency).map((p) => p.amount));
    const refunded = sumMoney(input.refunds.filter((r) => r.currency === currency).map((r) => r.amount));
    const netPaid = fromMinorUnits(toMinorUnits(paid) - toMinorUnits(refunded));
    const outstanding = fromMinorUnits(activeBookings.reduce((sum, booking) => {
      const due = toMinorUnits(booking.amount) - toSignedMinorUnits(booking.paid);
      return sum + (due > 0n ? due : 0n);
    }, 0n));
    return { currency, budget, forecast, committed, netPaid, outstanding };
  });
}

export function isOverpaid(agreed: string, payments: string[], refunds: string[] = []): boolean {
  const net = payments.reduce((sum, value) => sum + toMinorUnits(value), 0n) - refunds.reduce((sum, value) => sum + toMinorUnits(value), 0n);
  return net > toMinorUnits(agreed);
}

export function allocationDifference(agreed: string, allocations: string[]): string {
  return fromMinorUnits(toMinorUnits(agreed) - allocations.reduce((sum, value) => sum + toMinorUnits(value), 0n));
}

export function outstandingBalance(agreed: string, netPaid: string): string {
  const remaining = toMinorUnits(agreed) - toSignedMinorUnits(netPaid);
  return fromMinorUnits(remaining > 0n ? remaining : 0n);
}

export function scheduledPaymentRemaining(scheduled: string, payments: string[]): string {
  const remaining = toMinorUnits(scheduled) - payments.reduce((sum, value) => sum + toMinorUnits(value), 0n);
  return fromMinorUnits(remaining > 0n ? remaining : 0n);
}

export function refundOutstanding(expected: string, refunds: string[]): string {
  const remaining = toMinorUnits(expected) - refunds.reduce((sum, value) => sum + toMinorUnits(value), 0n);
  return fromMinorUnits(remaining > 0n ? remaining : 0n);
}
