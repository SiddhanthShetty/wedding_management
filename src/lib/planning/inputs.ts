import { z } from "zod";
import { isValidTimeZone } from "@/lib/planning/schedule";

const optionalMoney = z.string().trim().transform((value) => value === "" ? null : Number(value))
  .pipe(z.number().finite().min(0).max(999999999999.99).nullable());

const optionalCount = z.string().trim().transform((value) => value === "" ? null : Number(value))
  .pipe(z.number().int().min(0).max(1000000).nullable());

export const weddingSetupSchema = z.object({
  weddingId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  partnerOneDisplayName: z.string().trim().max(120),
  partnerTwoDisplayName: z.string().trim().max(120),
  weddingDate: z.string().trim().transform((value) => value || null)
    .pipe(z.union([z.iso.date(), z.null()])),
  weddingDateStatus: z.enum(["tentative", "confirmed"]),
  timezone: z.string().trim().min(1).max(80).refine(isValidTimeZone, "Use a valid IANA timezone."),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  mainLocations: z.string().transform((value) => [...new Set(value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))])
    .pipe(z.array(z.string().min(1).max(240)).max(20)),
  overallBudget: optionalMoney,
  planningNotes: z.string().max(10000),
}).superRefine((value, context) => {
  if (value.weddingDateStatus === "confirmed" && !value.weddingDate) {
    context.addIssue({ code: "custom", message: "A confirmed wedding date is required.", path: ["weddingDate"] });
  }
});

export const functionInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  functionType: z.string().trim().min(1).max(80),
  functionDate: z.string().trim(),
  startTime: z.string().trim(),
  endTime: z.string().trim(),
  venueName: z.string().trim().max(240),
  guestMapUrl: z.string().trim().max(2048).refine((value) => {
    if (value === "") return true;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "Use a valid secure https map link."),
  status: z.enum(["tentative", "confirmed", "cancelled"]),
  expectedAttendance: optionalCount,
  budgetAllocation: optionalMoney,
  coordinatorName: z.string().trim().max(160),
  dressCode: z.string().trim().max(240),
  notes: z.string().max(10000),
});

export type WeddingSetupInput = z.infer<typeof weddingSetupSchema>;
export type FunctionInput = z.infer<typeof functionInputSchema>;
