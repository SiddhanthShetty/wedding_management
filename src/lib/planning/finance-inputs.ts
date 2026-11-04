import { z } from "zod";
import { MONEY_PATTERN, toMinorUnits } from "./money";

const amount = z.string().regex(MONEY_PATTERN, "Use a non-negative amount with up to two decimal places.");
const signedAmount = z.string().regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, "Use an amount with up to two decimal places.");
const currency = z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code.");
const nullableUuid = z.union([z.literal(""), z.uuid()]);

export const estimateInput = z.object({ functionId: nullableUuid, category: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(200), amount, currency });
export const allocationInput = z.object({ functionId: nullableUuid, amount });
export const bookingInput = z.object({ supplierId: nullableUuid, sourceEstimateId: nullableUuid, category: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(200), amount, currency, status: z.enum(["tentative", "confirmed"]), allocations: z.array(allocationInput).min(1).max(30) }).superRefine((value,ctx)=>{
  const ids=value.allocations.map((row)=>row.functionId).filter(Boolean);
  if(ids.length!==new Set(ids).size)ctx.addIssue({code:"custom",path:["allocations"],message:"Use one allocation row for each function."});
  if(ids.length>0&&ids.length!==value.allocations.length)ctx.addIssue({code:"custom",path:["allocations"],message:"Use either one wedding-wide allocation or function allocations, not both."});
  if(ids.length===0&&value.allocations.length!==1)ctx.addIssue({code:"custom",path:["allocations"],message:"Use one wedding-wide allocation row."});
});
export const transactionInput = z.object({ bookingId: z.uuid(), kind: z.enum(["payment", "refund"]), amount: amount.refine((value) => value !== "0" && value !== "0.0" && value !== "0.00", "Amount must be greater than zero."), currency, date: z.iso.date(), payer: z.string().max(500), obligationId: nullableUuid, idempotencyKey: z.uuid(), note: z.string().max(4000), contributions: z.array(z.object({ memberUserId: nullableUuid, label: z.string().trim().min(1).max(160), amount })) }).superRefine((value,ctx)=>{
  if(value.contributions.length){try{const contributed=value.contributions.reduce((sum,row)=>sum+toMinorUnits(row.amount),BigInt(0));if(contributed!==toMinorUnits(value.amount))ctx.addIssue({code:"custom",path:["contributions"],message:"Contribution amounts must add up to the payment amount."});}catch{/* Amount fields already report their format errors. */}}
});
export const obligationInput = z.object({ bookingId: z.uuid(), label: z.string().trim().min(1).max(120), dueDate: z.iso.date(), amount: amount.refine((value) => value !== "0" && value !== "0.0" && value !== "0.00") });
export const budgetInput = z.object({ functionId: nullableUuid, category: z.string().trim().min(1).max(120), amount, currency, notes: z.string().max(4000) });
export const adjustmentInput = z.object({ functionId: nullableUuid, category: z.string().trim().min(1).max(120), reason: z.string().trim().min(1).max(500), amount: signedAmount.refine((value) => !["0", "0.0", "0.00", "-0", "-0.0", "-0.00"].includes(value)), currency });
export const reimbursementInput = z.object({ bookingId: nullableUuid, fromLabel: z.string().trim().min(1).max(160), toLabel: z.string().trim().min(1).max(160), amount: amount.refine((value) => value !== "0" && value !== "0.0" && value !== "0.00"), currency, dueDate: z.union([z.literal(""), z.iso.date()]), status: z.enum(["planned","paid"]), paidOn: z.union([z.literal(""), z.iso.date()]), idempotencyKey: z.uuid(), note: z.string().max(4000) });
export const cancelBookingInput = z.object({ bookingId: z.uuid(), note: z.string().max(4000), refundExpected: z.union([amount, z.literal("")]) });
