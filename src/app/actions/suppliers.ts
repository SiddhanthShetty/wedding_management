"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import {
  addSupplierAvailability, addSupplierFollowUpTask, addSupplierSpace, addSupplierVisit,
  createSupplierQuote, createWeddingSupplier, saveSupplierPreference,
  updateSupplierSpace, updateWeddingSupplier,
} from "@/lib/data/suppliers";
import {
  supplierAvailabilityInputSchema, supplierFollowUpTaskSchema, supplierInputSchema,
  supplierPreferenceSchema, supplierQuoteInputSchema, supplierSpaceInputSchema,
  supplierSpaceUpdateSchema, supplierVisitSchema,
} from "@/lib/planning/supplier-inputs";

export type SupplierFormState = { error?: string; message?: string; savedId?: string };
const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

function actionError(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the supplier details.";
  if (error instanceof AuthorizationDeniedError) return "You can no longer change this. Refresh the page, and ask the couple if it keeps happening.";
  return error instanceof Error && /planning edit/i.test(error.message)
    ? "You can change vendors but not tasks, so the follow-up task wasn't created."
    : "The change could not be saved. No success was recorded; refresh and try again.";
}

function supplierValues(formData: FormData) {
  return supplierInputSchema.safeParse({
    kind: read(formData, "kind"), name: read(formData, "name"), category: read(formData, "category"),
    contactPerson: read(formData, "contactPerson"), contactEmail: read(formData, "contactEmail"),
    contactPhone: read(formData, "contactPhone"), websiteUrl: read(formData, "websiteUrl"),
    mapUrl: read(formData, "mapUrl"), source: read(formData, "source"), notes: read(formData, "notes"),
    responsibleUserId: read(formData, "responsibleUserId"), status: read(formData, "status"),
    roomAvailabilityNotes: read(formData, "roomAvailabilityNotes"), cateringNotes: read(formData, "cateringNotes"),
    outsideVendorNotes: read(formData, "outsideVendorNotes"), parkingNotes: read(formData, "parkingNotes"),
    accessibilityNotes: read(formData, "accessibilityNotes"), petPolicy: read(formData, "petPolicy"),
    alcoholPolicy: read(formData, "alcoholPolicy"), musicPolicy: read(formData, "musicPolicy"),
    weatherBackupSpace: read(formData, "weatherBackupSpace"), weatherBackupCapacity: read(formData, "weatherBackupCapacity"),
  });
}

export async function createSupplierAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  const input = supplierValues(formData);
  if (!weddingId.success || !input.success) return { error: !input.success ? input.error.issues[0]?.message : "Something went wrong with this page. Refresh it and try again." };
  try {
    const id = await createWeddingSupplier(weddingId.data, input.data);
    revalidatePath("/venues-vendors");
    return { message: "Supplier saved.", savedId: id };
  } catch (error) { return { error: actionError(error) }; }
}

export async function updateSupplierAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  const supplierId = z.uuid().safeParse(read(formData, "supplierId"));
  const input = supplierValues(formData);
  if (!weddingId.success || !supplierId.success || !input.success) return { error: !input.success ? input.error.issues[0]?.message : "Invalid supplier selection." };
  try {
    const id = await updateWeddingSupplier(weddingId.data, supplierId.data, input.data);
    revalidatePath("/venues-vendors");
    return { message: "Supplier details saved.", savedId: id };
  } catch (error) { return { error: actionError(error) }; }
}

export async function addSupplierSpaceAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const input = supplierSpaceInputSchema.safeParse({ supplierId: read(formData, "supplierId"), name: read(formData, "name"), capacity: read(formData, "capacity"), notes: read(formData, "notes") });
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  if (!weddingId.success || !input.success) return { error: input.success ? "Something went wrong with this page. Refresh it and try again." : input.error.issues[0]?.message };
  try {
    const id = await addSupplierSpace(weddingId.data, input.data);
    revalidatePath("/venues-vendors");
    return { message: "Event space added.", savedId: id };
  } catch (error) { return { error: actionError(error) }; }
}

export async function updateSupplierSpaceAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const input = supplierSpaceUpdateSchema.safeParse({ supplierId: read(formData, "supplierId"), spaceId: read(formData, "spaceId"), name: read(formData, "name"), capacity: read(formData, "capacity"), notes: read(formData, "notes") });
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  const archive = read(formData, "archive") === "true";
  if (!weddingId.success || !input.success) return { error: input.success ? "Something went wrong with this page. Refresh it and try again." : input.error.issues[0]?.message };
  try {
    const id = await updateSupplierSpace(weddingId.data, input.data, archive);
    revalidatePath("/venues-vendors");
    return { message: archive ? "Event space archived." : "Event space saved.", savedId: id };
  } catch (error) { return { error: actionError(error) }; }
}

export async function addSupplierAvailabilityAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const input = supplierAvailabilityInputSchema.safeParse({ supplierId: read(formData, "supplierId"), requestedDate: read(formData, "requestedDate"), availabilityStatus: read(formData, "availabilityStatus"), checkedAt: read(formData, "checkedAt"), holdExpiresOn: read(formData, "holdExpiresOn"), notes: read(formData, "notes") });
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  if (!weddingId.success || !input.success) return { error: !input.success ? input.error.issues[0]?.message : "Something went wrong with this page. Refresh it and try again." };
  try {
    await addSupplierAvailability(weddingId.data, input.data);
    revalidatePath("/venues-vendors");
    return { message: "Availability note saved." };
  } catch (error) { return { error: actionError(error) }; }
}

export async function createSupplierQuoteAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const input = supplierQuoteInputSchema.safeParse({
    supplierId: read(formData, "supplierId"), quotedOn: read(formData, "quotedOn"), currency: read(formData, "currency"),
    totalAmount: read(formData, "totalAmount"), includes: read(formData, "includes"), excludes: read(formData, "excludes"),
    expiresOn: read(formData, "expiresOn"),
    items: formData.getAll("itemLabel").map((label, index) => ({
      label, kind: formData.getAll("itemKind")[index], amount: formData.getAll("itemAmount")[index] ?? "",
    })),
  });
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  if (!weddingId.success || !input.success) return { error: !input.success ? input.error.issues[0]?.message : "Something went wrong with this page. Refresh it and try again." };
  try {
    const id = await createSupplierQuote(weddingId.data, input.data);
    revalidatePath("/venues-vendors");
    return { message: "Quote version saved.", savedId: id };
  } catch (error) { return { error: actionError(error) }; }
}

export async function saveSupplierPreferenceAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const input = supplierPreferenceSchema.safeParse({ supplierId: read(formData, "supplierId"), preference: read(formData, "preference"), note: read(formData, "note") });
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  if (!weddingId.success || !input.success) return { error: input.success ? "Something went wrong with this page. Refresh it and try again." : input.error.issues[0]?.message };
  try {
    await saveSupplierPreference(weddingId.data, input.data);
    revalidatePath("/venues-vendors");
    return { message: "Your preference was saved." };
  } catch (error) { return { error: actionError(error) }; }
}

export async function addSupplierVisitAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const input = supplierVisitSchema.safeParse({ supplierId: read(formData, "supplierId"), visitDate: read(formData, "visitDate"), notes: read(formData, "notes") });
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  if (!weddingId.success || !input.success) return { error: input.success ? "Something went wrong with this page. Refresh it and try again." : input.error.issues[0]?.message };
  try {
    await addSupplierVisit(weddingId.data, input.data);
    revalidatePath("/venues-vendors");
    return { message: "Visit note saved." };
  } catch (error) { return { error: actionError(error) }; }
}

export async function addSupplierFollowUpTaskAction(_previous: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  const input = supplierFollowUpTaskSchema.safeParse({
    supplierId: read(formData, "supplierId"), title: read(formData, "title"), description: read(formData, "description"),
    ownerUserId: read(formData, "ownerUserId"), dueDate: read(formData, "dueDate"), priority: read(formData, "priority"),
  });
  const weddingId = z.uuid().safeParse(read(formData, "weddingId"));
  if (!weddingId.success || !input.success) return { error: !input.success ? input.error.issues[0]?.message : "Something went wrong with this page. Refresh it and try again." };
  try {
    const id = await addSupplierFollowUpTask(weddingId.data, input.data);
    revalidatePath("/venues-vendors");
    revalidatePath("/tasks");
    return { message: "Follow-up task saved.", savedId: id };
  } catch (error) { return { error: actionError(error) }; }
}
