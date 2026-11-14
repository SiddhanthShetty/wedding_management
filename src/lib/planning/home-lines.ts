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

type FamilyReplies = { families: number; invited: number; replied: number; coming: number };

/** For example "40 families · 25 of 38 replied · 96 guests coming". */
export function guestLine({ families, invited, replied, coming }: FamilyReplies): string | null {
  if (!families) return null;
  const list = `${families} famil${families === 1 ? "y" : "ies"}`;
  if (!invited) return `${list} · not invited to any event yet`;
  return `${list} · ${replied} of ${invited} replied${coming ? ` · ${coming} ${coming === 1 ? "guest" : "guests"} coming` : ""}`;
}
