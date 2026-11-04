import { z } from "zod";

const emptyToNull = z.string().trim().transform((value) => value || null);
const optionalUuid = emptyToNull.pipe(z.union([z.uuid(), z.null()]));
const optionalDate = emptyToNull.pipe(z.union([z.iso.date(), z.null()]));
const optionalHttpUrl = z.string().trim().max(2048).transform((value) => value || null)
  .pipe(z.union([z.url().refine((value) => /^https?:\/\//i.test(value), "Use an http or https link."), z.null()]));
const optionalCapacity = z.string().trim().transform((value) => value === "" ? null : Number(value))
  .pipe(z.union([z.number().int().min(0).max(100000), z.null()]));
const optionalAmount = z.string().trim().transform((value) => value === "" ? null : Number(value))
  .pipe(z.union([z.number().finite().min(0).max(999999999999.99).refine((value) => Number(value.toFixed(2)) === value, "Use at most two decimal places."), z.null()]));

export const supplierInputSchema = z.object({
  kind: z.enum(["venue", "vendor"]),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  contactPerson: z.string().trim().max(160),
  contactEmail: z.string().trim().max(254).refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid contact email."),
  contactPhone: z.string().trim().max(80),
  websiteUrl: optionalHttpUrl,
  mapUrl: optionalHttpUrl,
  source: z.string().trim().max(1000),
  notes: z.string().trim().max(10000),
  responsibleUserId: optionalUuid,
  status: z.enum(["researching", "contacted", "visit_planned", "shortlisted", "selected", "booked", "rejected", "archived"]),
  roomAvailabilityNotes: z.string().trim().max(5000),
  cateringNotes: z.string().trim().max(5000),
  outsideVendorNotes: z.string().trim().max(5000),
  parkingNotes: z.string().trim().max(5000),
  accessibilityNotes: z.string().trim().max(5000),
  petPolicy: z.enum(["unknown", "allowed", "not_allowed", "conditional"]),
  alcoholPolicy: z.enum(["unknown", "allowed", "not_allowed", "conditional"]),
  musicPolicy: z.enum(["unknown", "allowed", "not_allowed", "conditional"]),
  weatherBackupSpace: z.string().trim().max(200),
  weatherBackupCapacity: optionalCapacity,
});

export const supplierSpaceInputSchema = z.object({
  supplierId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  capacity: optionalCapacity,
  notes: z.string().trim().max(3000),
});

export const supplierSpaceUpdateSchema = supplierSpaceInputSchema.extend({ spaceId: z.uuid() });

export const supplierAvailabilityInputSchema = z.object({
  supplierId: z.uuid(),
  requestedDate: z.iso.date(),
  availabilityStatus: z.enum(["unknown", "requested", "available", "unavailable", "on_hold"]),
  checkedAt: optionalDate,
  holdExpiresOn: optionalDate,
  notes: z.string().trim().max(3000),
}).superRefine((value, context) => {
  if (!["unknown", "requested"].includes(value.availabilityStatus) && !value.checkedAt) {
    context.addIssue({ code: "custom", message: "Add the date availability was checked.", path: ["checkedAt"] });
  }
});

export const supplierQuoteInputSchema = z.object({
  supplierId: z.uuid(),
  quotedOn: z.iso.date(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a three-letter uppercase currency code."),
  totalAmount: optionalAmount,
  includes: z.string().trim().max(10000),
  excludes: z.string().trim().max(10000),
  expiresOn: optionalDate,
  items: z.array(z.object({
    kind: z.enum(["service", "tax", "additional"]),
    label: z.string().trim().min(1).max(200),
    amount: optionalAmount,
  })).min(1).max(100),
});

export const supplierPreferenceSchema = z.object({
  supplierId: z.uuid(),
  preference: z.enum(["prefer", "neutral", "not_preferred"]),
  note: z.string().trim().max(2000),
});

export const supplierVisitSchema = z.object({
  supplierId: z.uuid(),
  visitDate: optionalDate,
  notes: z.string().trim().min(1).max(10000),
});

export const supplierFollowUpTaskSchema = z.object({
  supplierId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000),
  ownerUserId: optionalUuid,
  dueDate: optionalDate,
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type SupplierQuoteInput = z.infer<typeof supplierQuoteInputSchema>;
