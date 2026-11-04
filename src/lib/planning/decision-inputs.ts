import { z } from "zod";

export const decisionInputSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(20),
}).superRefine((value, context) => {
  if (new Set(value.options.map((option) => option.toLocaleLowerCase())).size !== value.options.length) {
    context.addIssue({ code: "custom", message: "Decision options must be unique.", path: ["options"] });
  }
});

export const decisionUpdateSchema = z.object({
  decisionId: z.uuid(),
  version: z.number().int().positive(),
  question: z.string().trim().min(1).max(2000),
  status: z.enum(["open", "decided", "deferred"]),
  finalOptionId: z.string().trim().transform((value) => value || null).pipe(z.union([z.uuid(), z.null()])),
  decisionDate: z.string().trim().transform((value) => value || null).pipe(z.union([z.iso.date(), z.null()])),
  reason: z.string().max(10000),
}).superRefine((value, context) => {
  if (value.status === "decided" && (!value.finalOptionId || !value.decisionDate)) {
    context.addIssue({ code: "custom", message: "Choose a final option and decision date before finalising." });
  }
});
