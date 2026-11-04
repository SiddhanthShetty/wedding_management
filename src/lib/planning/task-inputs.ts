import { z } from "zod";

const optionalUuid = z.string().trim().transform((value) => value || null)
  .pipe(z.union([z.uuid(), z.null()]));
const optionalDate = z.string().trim().transform((value) => value || null)
  .pipe(z.union([z.iso.date(), z.null()]));

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000),
  functionId: optionalUuid,
  ownerUserId: optionalUuid,
  dueDate: optionalDate,
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["not_started", "in_progress", "blocked", "completed", "cancelled"]),
  relatedVendorReference: z.string().trim().max(240),
  relatedBookingReference: z.string().trim().max(240),
  dependsOnTaskId: optionalUuid,
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export function taskFormValues(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    functionId: formData.get("functionId"),
    ownerUserId: formData.get("ownerUserId"),
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority"),
    status: formData.get("status"),
    relatedVendorReference: formData.get("relatedVendorReference"),
    relatedBookingReference: formData.get("relatedBookingReference"),
    dependsOnTaskId: formData.get("dependsOnTaskId"),
  };
}
