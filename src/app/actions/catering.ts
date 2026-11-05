"use server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { createCateringService, runCateringRpc, saveCateringMenu, saveCateringTasting, setCateringCount, setCateringGuestCategory, updateCateringService } from "@/lib/data/catering";

export type CateringActionState = { error?: string; message?: string };
const text = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
const id = z.uuid();
function errorMessage(error: unknown) { if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the entered values."; if (error instanceof AuthorizationDeniedError) return "Your logistics edit access is no longer available. Refresh and try again."; return error instanceof Error ? error.message : "Could not save this catering change."; }
async function withWedding(form: FormData, task: (weddingId: string) => Promise<void>): Promise<CateringActionState> {
  const wedding = id.safeParse(text(form,"weddingId")); if (!wedding.success) return { error: "Invalid wedding workspace." };
  try { await task(wedding.data); revalidatePath("/logistics"); return { message: "Catering change saved." }; } catch (error) { return { error: errorMessage(error) }; }
}

export async function createCateringServiceAction(_state: CateringActionState, form: FormData): Promise<CateringActionState> {
  const parsed = z.object({ functionId:id, name:z.string().trim().min(1).max(160), serviceTime:z.string().optional(), currency:z.string().regex(/^[A-Z]{3}$/), catererId:z.union([id,z.literal("")]), bookingId:z.union([id,z.literal("")]), deadline:z.string().optional() }).safeParse({ functionId:text(form,"functionId"),name:text(form,"name"),serviceTime:text(form,"serviceTime"),currency:text(form,"currency").toUpperCase(),catererId:text(form,"catererId"),bookingId:text(form,"bookingId"),deadline:text(form,"deadline") });
  if (!parsed.success) return { error: errorMessage(parsed.error) };
  return withWedding(form, async weddingId => createCateringService(weddingId,{function_id:parsed.data.functionId,name:parsed.data.name,service_time:parsed.data.serviceTime||null,currency:parsed.data.currency,caterer_supplier_id:parsed.data.catererId||null,booking_id:parsed.data.bookingId||null,final_count_deadline:parsed.data.deadline||null}));
}

export async function updateCateringServiceAction(_state:CateringActionState,form:FormData):Promise<CateringActionState>{
  const parsed=z.object({serviceId:id,name:z.string().trim().min(1).max(160),serviceTime:z.string().optional(),currency:z.string().regex(/^[A-Z]{3}$/),catererId:z.union([id,z.literal("")]),bookingId:z.union([id,z.literal("")]),deadline:z.string().optional()}).safeParse({serviceId:text(form,"serviceId"),name:text(form,"name"),serviceTime:text(form,"serviceTime"),currency:text(form,"currency").toUpperCase(),catererId:text(form,"catererId"),bookingId:text(form,"bookingId"),deadline:text(form,"deadline")});
  if(!parsed.success)return{error:errorMessage(parsed.error)};
  return withWedding(form,async weddingId=>updateCateringService(weddingId,parsed.data.serviceId,{name:parsed.data.name,service_time:parsed.data.serviceTime||null,currency:parsed.data.currency,caterer_supplier_id:parsed.data.catererId||null,booking_id:parsed.data.bookingId||null,final_count_deadline:parsed.data.deadline||null}));
}

export async function saveCateringCountsAction(_state:CateringActionState,form:FormData):Promise<CateringActionState>{
  const parsed=z.object({serviceId:id,category:z.enum(["adult","child","vendor","staff"]),manual:z.union([z.literal(""),z.coerce.number().int().min(0).max(100000)]),actual:z.union([z.literal(""),z.coerce.number().int().min(0).max(100000)]),rate:z.union([z.literal(""),z.string().regex(/^\d{1,12}(\.\d{1,2})?$/)]),guarantee:z.union([z.literal(""),z.coerce.number().int().min(0).max(100000)]),buffer:z.coerce.number().int().min(0).max(100000)}).safeParse({serviceId:text(form,"serviceId"),category:text(form,"category"),manual:text(form,"manual"),actual:text(form,"actual"),rate:text(form,"rate"),guarantee:text(form,"guarantee"),buffer:text(form,"buffer")});
  if(!parsed.success)return{error:errorMessage(parsed.error)};
  return withWedding(form,async weddingId=>{
    await setCateringCount(weddingId,parsed.data.serviceId,parsed.data.category,{manual_expected_count:parsed.data.manual===""?null:parsed.data.manual,actual_attendance:parsed.data.actual===""?null:parsed.data.actual,per_plate_rate:parsed.data.rate===""?null:parsed.data.rate,...(parsed.data.category==="adult"?{approved_guarantee:parsed.data.guarantee===""?null:parsed.data.guarantee,agreed_buffer:parsed.data.buffer}:{})});
  });
}

export async function saveCateringMenuAction(_state:CateringActionState,form:FormData):Promise<CateringActionState>{
  const parsed=z.object({serviceId:id,title:z.string().trim().min(1).max(180),notes:z.string().max(4000),items:z.string().max(12000)}).safeParse({serviceId:text(form,"serviceId"),title:text(form,"title"),notes:text(form,"notes"),items:text(form,"items")}); if(!parsed.success)return{error:errorMessage(parsed.error)};
  const items=parsed.data.items.split("\n").map(line=>line.trim()).filter(Boolean).map(line=>({name:line.slice(0,180),details:"",dietary_labels:[],allergen_summary:""}));
  return withWedding(form,async weddingId=>saveCateringMenu(weddingId,parsed.data.serviceId,parsed.data.title,parsed.data.notes,items));
}

export async function approveCateringMenuAction(_state:CateringActionState,form:FormData):Promise<CateringActionState>{
  const parsed=z.object({menuId:id}).safeParse({menuId:text(form,"menuId")}); if(!parsed.success)return{error:errorMessage(parsed.error)};
  return withWedding(form,async weddingId=>{await runCateringRpc(weddingId,"approve_catering_menu",{p_wedding_id:weddingId,p_menu_id:parsed.data.menuId});});
}

export async function cateringTastingAction(_state:CateringActionState,form:FormData):Promise<CateringActionState>{const parsed=z.object({serviceId:id,when:z.string().optional(),status:z.enum(["planned","completed","cancelled"]),feedback:z.string().max(4000)}).safeParse({serviceId:text(form,"serviceId"),when:text(form,"when"),status:text(form,"status"),feedback:text(form,"feedback")});if(!parsed.success)return{error:errorMessage(parsed.error)};return withWedding(form,async weddingId=>saveCateringTasting(weddingId,{meal_service_id:parsed.data.serviceId,appointment_at:parsed.data.when||null,status:parsed.data.status,feedback:parsed.data.feedback}));}

export async function cateringGuestCategoryAction(_state:CateringActionState,form:FormData):Promise<CateringActionState>{const parsed=z.object({serviceId:id,guestId:id,category:z.enum(["adult","child",""])}).safeParse({serviceId:text(form,"serviceId"),guestId:text(form,"guestId"),category:text(form,"category")});if(!parsed.success)return{error:errorMessage(parsed.error)};return withWedding(form,async weddingId=>setCateringGuestCategory(weddingId,parsed.data.serviceId,parsed.data.guestId,parsed.data.category||null));}

export async function snapshotCateringAction(_state:CateringActionState,form:FormData):Promise<CateringActionState>{const parsed=z.object({serviceId:id}).safeParse({serviceId:text(form,"serviceId")});if(!parsed.success)return{error:errorMessage(parsed.error)};return withWedding(form,async weddingId=>{await runCateringRpc(weddingId,"capture_catering_count_snapshot",{p_wedding_id:weddingId,p_service_id:parsed.data.serviceId});});}
