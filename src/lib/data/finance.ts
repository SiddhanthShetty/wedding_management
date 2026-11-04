import "server-only";

import { authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromMinorUnits, toMinorUnits, type FinanceBooking, calculateFinanceTotals, isOverpaid, outstandingBalance, refundOutstanding, scheduledPaymentRemaining } from "@/lib/planning/money";

type Row = Record<string, any>;
const fail = (message: string) => { throw new Error(message); };

export async function getFinanceDashboard(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "read");
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all([
    supabase.from("budget_allocations").select("id,function_id,category,amount_text:amount::text,currency,notes").eq("wedding_id", weddingId).order("category"),
    supabase.from("financial_estimates").select("id,function_id,category,label,amount_text:amount::text,currency,status,created_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }),
    supabase.from("bookings").select("id,supplier_id,source_estimate_id,category,label,agreed_total_text:agreed_total::text,currency,status,cancellation_note,cancelled_at,refund_expected_amount_text:refund_expected_amount::text,created_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }),
    supabase.from("booking_function_allocations").select("booking_id,function_id,amount_text:amount::text").eq("wedding_id", weddingId),
    supabase.from("booking_payment_obligations").select("id,booking_id,label,due_date,amount_text:amount::text").eq("wedding_id", weddingId).order("due_date"),
    supabase.from("booking_transactions").select("id,booking_id,kind,amount_text:amount::text,currency,happened_on,payer_label,obligation_id,note,created_at").eq("wedding_id", weddingId).order("happened_on", { ascending: false }),
    supabase.from("booking_transaction_contributions").select("transaction_id,member_user_id,contributor_label,amount_text:amount::text").eq("wedding_id", weddingId),
    supabase.from("reimbursements").select("id,booking_id,from_label,to_label,amount_text:amount::text,currency,due_date,status,note,paid_on").eq("wedding_id", weddingId).order("created_at", { ascending: false }),
    supabase.from("forecast_adjustments").select("id,function_id,category,reason,amount_text:amount::text,currency,created_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }),
    supabase.from("functions").select("id,name,function_date,status").eq("wedding_id", weddingId).order("function_date"),
    supabase.from("suppliers").select("id,name,category").eq("wedding_id", weddingId).order("name"),
  ]);
  for (const result of results) if (result.error) fail("Could not load wedding financial records.");
  const [allocations, estimates, bookings, splits, obligations, transactions, contributions, reimbursements, adjustments, functions, suppliers] = results.map((result) => (result.data ?? []) as Row[]);
  const txByBooking = new Map<string, Row[]>();
  for (const tx of transactions!) txByBooking.set(tx.booking_id, [...(txByBooking.get(tx.booking_id) ?? []), tx]);
  const financeBookings: FinanceBooking[] = bookings!.map((booking) => {
    const txs = txByBooking.get(booking.id) ?? [];
    const paid = txs.filter((tx) => tx.kind === "payment").reduce((sum, tx) => sum + toMinorUnits(String(tx.amount_text)), 0n);
    const refunds = txs.filter((tx) => tx.kind === "refund").reduce((sum, tx) => sum + toMinorUnits(String(tx.amount_text)), 0n);
    return { status: booking.status, amount: String(booking.agreed_total_text), currency: booking.currency, paid: fromMinorUnits(paid - refunds) };
  });
  const totals = calculateFinanceTotals({
    budget: context.wedding.overall_budget == null ? null : String(context.wedding.overall_budget), budgetCurrency: context.wedding.currency,
    bookings: financeBookings,
    estimates: estimates!.map((row) => ({ status: row.status, amount: String(row.amount_text), currency: row.currency })),
    adjustments: adjustments!.map((row) => ({ amount: String(row.amount_text), currency: row.currency })),
    payments: transactions!.filter((row) => row.kind === "payment").map((row) => ({ amount: String(row.amount_text), currency: row.currency })),
    refunds: transactions!.filter((row) => row.kind === "refund").map((row) => ({ amount: String(row.amount_text), currency: row.currency })),
  });
  const supplierNames = new Map(suppliers!.map((row) => [row.id, `${row.name} · ${row.category}`]));
  const functionNames = new Map(functions!.map((row) => [row.id, row.name]));
  const bookingDTOs: Row[] = bookings!.map((booking) => {
    const bookingSplits = splits!.filter((row) => row.booking_id === booking.id);
    const txs = txByBooking.get(booking.id) ?? [];
    const payments = txs.filter((tx) => tx.kind === "payment");
    const refunds = txs.filter((tx) => tx.kind === "refund");
    const netPaid = payments.reduce((sum, tx) => sum + toMinorUnits(String(tx.amount_text)), 0n) - refunds.reduce((sum, tx) => sum + toMinorUnits(String(tx.amount_text)), 0n);
    return {
      ...booking, agreed_total: String(booking.agreed_total_text), refund_expected_amount: booking.refund_expected_amount_text == null ? null : String(booking.refund_expected_amount_text),
      supplier_name: booking.supplier_id ? supplierNames.get(booking.supplier_id) ?? "Supplier" : "No supplier selected",
      allocated_total: fromMinorUnits(bookingSplits.reduce((sum, row) => sum + toMinorUnits(String(row.amount_text)), 0n)),
      allocation_labels: bookingSplits.map((row) => `${row.function_id ? functionNames.get(row.function_id) ?? "Function" : "Wedding-wide"}: ${String(row.amount_text)}`),
      net_paid: fromMinorUnits(netPaid),
      balance: outstandingBalance(String(booking.agreed_total_text), fromMinorUnits(netPaid)),
      overpaid: isOverpaid(String(booking.agreed_total_text), payments.map((tx) => String(tx.amount_text)), refunds.map((tx) => String(tx.amount_text))),
      transactions: txs.map((tx) => ({ ...tx, amount: tx.amount_text, contributions: contributions!.filter((contribution) => contribution.transaction_id === tx.id).map((contribution)=>({...contribution,amount:contribution.amount_text})) })),
    };
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: context.wedding.timezone }).format(new Date());
  const upcoming = obligations!.filter((obligation) => obligation.due_date >= today && bookings!.find((booking) => booking.id === obligation.booking_id)?.status !== "cancelled").map((obligation) => {
    const booking = bookings!.find((row) => row.id === obligation.booking_id);
    return { ...obligation, amount: String(obligation.amount_text), remaining: scheduledPaymentRemaining(String(obligation.amount_text), transactions!.filter((tx) => tx.obligation_id === obligation.id && tx.kind === "payment").map((tx) => String(tx.amount_text))), currency: booking?.currency ?? context.wedding.currency, booking_label: booking?.label ?? "Booking" };
  }).filter((row) => row.remaining !== "0.00").slice(0, 12);
  const refundDue = bookingDTOs.filter((booking) => booking.status === "cancelled" && booking.refund_expected_amount !== null).map((booking) => {
    const refundRows = booking.transactions.filter((tx: Row) => tx.kind === "refund");
    return { booking: booking.label, currency: booking.currency, amount: refundOutstanding(booking.refund_expected_amount!, refundRows.map((tx:Row)=>String(tx.amount_text))) };
  }).filter((row) => row.amount !== "0.00");
  const canEdit = context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.suppliers_finance === "edit";
  return {
    wedding: context.wedding, canEdit, totals, bookings: bookingDTOs,
    estimates: estimates!.map((row) => ({ ...row, amount: String(row.amount_text), function_name: row.function_id ? functionNames.get(row.function_id) ?? "Function" : "Wedding-wide" })),
    allocations: allocations!.map((row) => ({ ...row, amount: String(row.amount_text), function_name: row.function_id ? functionNames.get(row.function_id) ?? "Function" : "Wedding-wide" })),
    functions: functions!, suppliers: suppliers!, obligations: upcoming, reimbursements: reimbursements!.map((row) => ({ ...row, amount: String(row.amount_text) })),
    adjustments: adjustments!.map((row) => ({ ...row, amount: String(row.amount_text) })), refundDue,
  };
}

export async function saveFinancialRecord(weddingId: string, table: string, values: Record<string, unknown>) {
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const allowed = new Set(["financial_estimates", "budget_allocations", "booking_payment_obligations", "reimbursements", "forecast_adjustments"]);
  if (!allowed.has(table)) throw new Error("Unsupported financial record type.");
  const supabase = await createSupabaseServerClient();
  const authorColumn = table === "reimbursements" ? "recorded_by_user_id" : "created_by_user_id";
  const { data, error } = await supabase.from(table).insert({ ...values, wedding_id: weddingId, [authorColumn]: context.user.id }).select("id").single();
  if (error || !data) throw new Error("Could not save the financial record.");
  return data.id as string;
}

export async function createFinancialBooking(weddingId: string, values: Record<string, unknown>, allocations: Array<Record<string, unknown>>) {
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_financial_booking", {
    p_values: { ...values, wedding_id: weddingId }, p_allocations: allocations,
  });
  if (error || !data) throw new Error("Could not create booking. Confirm that allocations match the agreed total and that a linked estimate is still active.");
  return data as string;
}

export async function recordBookingTransaction(weddingId: string, values: Record<string, unknown>, contributions: Array<Record<string, unknown>>) {
  await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_booking_transaction", {
    p_values: { ...values, wedding_id: weddingId }, p_contributions: contributions,
  });
  if (error || !data) throw new Error("Could not record this payment or refund. Check the amount, currency and contribution total.");
  return data as string;
}

export async function cancelFinancialBooking(weddingId: string, bookingId: string, note: string, refundExpected: string | null) {
  await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_financial_booking", {
    p_wedding_id: weddingId, p_booking_id: bookingId, p_note: note, p_refund_expected: refundExpected,
  });
  if (error) throw new Error("Could not cancel this booking. Refresh and confirm it has not already been cancelled.");
}
