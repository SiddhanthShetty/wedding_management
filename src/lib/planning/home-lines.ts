/** The one-line money and guest summaries on Home. */
import { formatMoney } from "@/lib/planning/money";

type Total = { currency: string; budget: string | null; committed: string; outstanding: string };

/** For example "₹4,50,000.00 booked of ₹15,00,000.00 · ₹3,50,000.00 still to pay · 2 payments due in 30 days". */
export function moneyLine(totals: Total[], dueSoon: number, currency: string): string | null {
  const total = totals.find((row) => row.currency === currency) ?? totals[0];
  if (!total) return null;
  const booked = total.budget === null ? `${formatMoney(total.committed, total.currency)} booked` : `${formatMoney(total.committed, total.currency)} booked of ${formatMoney(total.budget, total.currency)}`;
  const parts = [booked, `${formatMoney(total.outstanding, total.currency)} still to pay`];
  if (dueSoon > 0) parts.push(`${dueSoon} payment${dueSoon === 1 ? "" : "s"} due in 30 days`);
  return parts.join(" · ");
}

type FunctionReplies = { invited: number; pending: number };

/** For example "120 guests · 45 of 200 invitations answered". */
export function guestLine(guests: number, functions: FunctionReplies[]): string | null {
  if (!guests) return null;
  const invited = functions.reduce((sum, fn) => sum + fn.invited, 0);
  const answered = functions.reduce((sum, fn) => sum + Math.max(0, fn.invited - fn.pending), 0);
  const people = `${guests} guest${guests === 1 ? "" : "s"}`;
  return invited ? `${people} · ${answered} of ${invited} invitation${invited === 1 ? "" : "s"} answered` : `${people} · not invited to any function yet`;
}
