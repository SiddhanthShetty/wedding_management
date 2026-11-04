"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { saveFinancialRecord, createFinancialBooking, recordBookingTransaction, cancelFinancialBooking } from "@/lib/data/finance";
import { adjustmentInput, bookingInput, budgetInput, estimateInput, obligationInput, reimbursementInput, transactionInput, cancelBookingInput } from "@/lib/planning/finance-inputs";

export type FinanceFormState = { error?: string; message?: string };
const str = (form: FormData, name: string) => { const value = form.get(name); return typeof value === "string" ? value : ""; };
const arr = (form: FormData, name: string) => form.getAll(name).map((value) => typeof value === "string" ? value : "");
const wedding = (form: FormData) => z.uuid().safeParse(str(form, "weddingId"));

function message(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the entered details.";
  if (error instanceof AuthorizationDeniedError) return "Your finance edit access is no longer available. Refresh and try again.";
  return error instanceof Error && error.message.includes("allocations") ? error.message : "The change could not be saved. No success was recorded; refresh and try again.";
}
async function runFinance(form: FormData, task: (weddingId: string) => Promise<void>): Promise<FinanceFormState> {
  const weddingId = wedding(form);
  if (!weddingId.success) return { error: "Invalid wedding workspace." };
  try { await task(weddingId.data); revalidatePath("/budget"); return { message: "Financial record saved." }; }
  catch (error) { return { error: message(error) }; }
}

export async function saveEstimateAction(_state: FinanceFormState, form: FormData): Promise<FinanceFormState> {
  const parsed = estimateInput.safeParse({ functionId: str(form,"functionId"), category: str(form,"category"), label: str(form,"label"), amount: str(form,"amount"), currency: str(form,"currency") });
  if (!parsed.success) return { error: message(parsed.error) };
  return runFinance(form, async (weddingId) => { await saveFinancialRecord(weddingId,"financial_estimates",{ function_id: parsed.data.functionId || null, category: parsed.data.category, label: parsed.data.label, amount: parsed.data.amount, currency: parsed.data.currency }); });
}

export async function saveBudgetAllocationAction(_state: FinanceFormState, form: FormData): Promise<FinanceFormState> {
  const parsed = budgetInput.safeParse({ functionId: str(form,"functionId"), category: str(form,"category"), amount: str(form,"amount"), currency: str(form,"currency"), notes: str(form,"notes") });
  if (!parsed.success) return { error: message(parsed.error) };
  return runFinance(form, async (weddingId) => { await saveFinancialRecord(weddingId,"budget_allocations",{ function_id: parsed.data.functionId || null, category: parsed.data.category, amount: parsed.data.amount, currency: parsed.data.currency, notes: parsed.data.notes }); });
}

export async function saveBookingAction(_state: FinanceFormState, form: FormData): Promise<FinanceFormState> {
  const functionIds = arr(form,"allocationFunctionId"); const amounts = arr(form,"allocationAmount");
  const parsed = bookingInput.safeParse({ supplierId: str(form,"supplierId"), sourceEstimateId: str(form,"sourceEstimateId"), category: str(form,"category"), label: str(form,"label"), amount: str(form,"amount"), currency: str(form,"currency"), status: str(form,"status"), allocations: functionIds.map((functionId,index)=>({functionId,amount:amounts[index]??""})).filter((row)=>row.amount !== "") });
  if (!parsed.success) return { error: message(parsed.error) };
  return runFinance(form, async (weddingId) => { await createFinancialBooking(weddingId,{ supplier_id: parsed.data.supplierId || null, source_estimate_id: parsed.data.sourceEstimateId || null, category: parsed.data.category, label: parsed.data.label, agreed_total: parsed.data.amount, currency: parsed.data.currency, status: parsed.data.status },parsed.data.allocations.map((row)=>({function_id:row.functionId||null,amount:row.amount}))); });
}

export async function saveObligationAction(_state: FinanceFormState, form: FormData): Promise<FinanceFormState> {
  const parsed = obligationInput.safeParse({ bookingId: str(form,"bookingId"), label: str(form,"label"), dueDate: str(form,"dueDate"), amount: str(form,"amount") });
  if (!parsed.success) return { error: message(parsed.error) };
  return runFinance(form, async (weddingId) => { await saveFinancialRecord(weddingId,"booking_payment_obligations",{ booking_id:parsed.data.bookingId,label:parsed.data.label,due_date:parsed.data.dueDate,amount:parsed.data.amount }); });
}

export async function recordTransactionAction(_state: FinanceFormState, form: FormData): Promise<FinanceFormState> {
  const amount = str(form,"amount");
  const labels=arr(form,"contributorLabel"); const amounts=arr(form,"contributionAmount");
  const contributions=labels.map((label,index)=>({memberUserId:"",label,amount:amounts[index]??""})).filter((row)=>row.label!==""||row.amount!=="");
  const payer=contributions.map((row)=>row.label).filter(Boolean).join(", ").slice(0,500);
  const parsed = transactionInput.safeParse({ bookingId:str(form,"bookingId"),kind:str(form,"kind"),amount,currency:str(form,"currency"),date:str(form,"date"),payer,obligationId:str(form,"obligationId"),idempotencyKey:str(form,"idempotencyKey"),note:str(form,"note"),contributions });
  if (!parsed.success) return { error: message(parsed.error) };
  return runFinance(form, async (weddingId) => { await recordBookingTransaction(weddingId,{booking_id:parsed.data.bookingId,kind:parsed.data.kind,amount:parsed.data.amount,currency:parsed.data.currency,happened_on:parsed.data.date,payer_label:parsed.data.payer,obligation_id:parsed.data.obligationId||null,idempotency_key:parsed.data.idempotencyKey,note:parsed.data.note},parsed.data.contributions.map((row)=>({member_user_id:row.memberUserId||null,contributor_label:row.label,amount:row.amount}))); });
}

export async function saveAdjustmentAction(_state: FinanceFormState, form: FormData): Promise<FinanceFormState> {
  const parsed = adjustmentInput.safeParse({functionId:str(form,"functionId"),category:str(form,"category"),reason:str(form,"reason"),amount:str(form,"amount"),currency:str(form,"currency")});
  if (!parsed.success) return {error:message(parsed.error)};
  return runFinance(form, async (weddingId)=>{await saveFinancialRecord(weddingId,"forecast_adjustments",{function_id:parsed.data.functionId||null,category:parsed.data.category,reason:parsed.data.reason,amount:parsed.data.amount,currency:parsed.data.currency});});
}

export async function saveReimbursementAction(_state: FinanceFormState, form: FormData): Promise<FinanceFormState> {
  const parsed = reimbursementInput.safeParse({bookingId:str(form,"bookingId"),fromLabel:str(form,"fromLabel"),toLabel:str(form,"toLabel"),amount:str(form,"amount"),currency:str(form,"currency"),dueDate:str(form,"dueDate"),status:str(form,"status"),paidOn:str(form,"paidOn"),idempotencyKey:str(form,"idempotencyKey"),note:str(form,"note")});
  if (!parsed.success) return {error:message(parsed.error)};
  if(parsed.data.status==="paid"&&!parsed.data.paidOn)return {error:"Add the date when this reimbursement was paid."};
  return runFinance(form, async (weddingId)=>{await saveFinancialRecord(weddingId,"reimbursements",{booking_id:parsed.data.bookingId||null,from_label:parsed.data.fromLabel,to_label:parsed.data.toLabel,amount:parsed.data.amount,currency:parsed.data.currency,due_date:parsed.data.dueDate||null,idempotency_key:parsed.data.idempotencyKey,note:parsed.data.note,status:parsed.data.status,paid_on:parsed.data.paidOn||null});});
}

export async function cancelBookingAction(_state: FinanceFormState,form:FormData):Promise<FinanceFormState>{
  const parsed=cancelBookingInput.safeParse({bookingId:str(form,"bookingId"),note:str(form,"note"),refundExpected:str(form,"refundExpected")});
  if(!parsed.success)return {error:message(parsed.error)};
  return runFinance(form,async(weddingId)=>{await cancelFinancialBooking(weddingId,parsed.data.bookingId,parsed.data.note,parsed.data.refundExpected||null);});
}
