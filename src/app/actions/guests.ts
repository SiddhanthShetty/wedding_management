"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { createGuestPlusOne, createHouseholdPortalLink, exportWeddingGuests, getGuestWorkspace, importGuestRows, recordGuestRsvp, resolveGuestImportDuplicate, revokeHouseholdPortalLink, saveGuest, saveGuestHousehold, setGuestInvitation, suggestGuestDuplicates, type GuestImportRecord } from "@/lib/data/guests";
import { guestImportRows, guestInput, householdInput, invitationInput, plusOneInput, rsvpInput } from "@/lib/planning/guest-inputs";
import { recordPortalGuestProfile, recordPortalRsvp } from "@/lib/guest-portal/server";
import { z as portalZ } from "zod";

export type GuestActionState={error?:string;message?:string;savedId?:string;data?:unknown};
const read=(form:FormData,key:string)=>{const value=form.get(key);return typeof value==="string"?value:"";};
function actionError(error:unknown){
  if(error instanceof ZodError)return error.issues[0]?.message??"Check the guest details.";
  if(error instanceof AuthorizationDeniedError)return "Your guest edit access is no longer available. Refresh and try again.";
  if(error instanceof Error&&/(guest|rsvp) edit conflict/i.test(error.message))return error.message;
  return error instanceof Error&&/(already imported|duplicate)/i.test(error.message)?error.message:"Could not save this guest change. No success was recorded; refresh and try again.";
}
function weddingId(form:FormData){return z.uuid().safeParse(read(form,"weddingId"));}
function values<T extends z.ZodType>(form:FormData,schema:T){
  return schema.safeParse(Object.fromEntries([...form.entries()].filter(([key])=>!key.startsWith("$ACTION_")&&key!=="weddingId")));
}
async function revalidate(){revalidatePath("/guests");}

export async function saveHouseholdAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const parsed=values(form,householdInput);const id=z.union([z.literal(""),z.uuid()]).safeParse(read(form,"householdId"));
  if(!wedding.success||!parsed.success||!id.success)return {error:parsed.success?"Invalid household details.":actionError(parsed.error)};
  try{const savedId=await saveGuestHousehold(wedding.data,id.data||null,{name:parsed.data.name,contact_name:parsed.data.contactName,contact_email:parsed.data.contactEmail,contact_phone:parsed.data.contactPhone,address:parsed.data.address,notes:parsed.data.notes});await revalidate();return {message:id.data?"Household updated.":"Household created.",savedId};}catch(error){return {error:actionError(error)};}
}

export async function saveGuestAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const parsed=values(form,guestInput);const id=z.union([z.literal(""),z.uuid()]).safeParse(read(form,"guestId"));const expected=z.union([z.literal(""),z.string().datetime()]).safeParse(read(form,"expectedUpdatedAt"));
  if(!wedding.success||!parsed.success||!id.success||!expected.success)return {error:parsed.success?"Invalid guest selection.":actionError(parsed.error)};
  try{const savedId=await saveGuest(wedding.data,id.data||null,{household_id:parsed.data.householdId||null,full_name:parsed.data.fullName,email:parsed.data.email,phone:parsed.data.phone,family_side:parsed.data.familySide,follow_up_owner_user_id:parsed.data.followUpOwnerUserId||null,meal_preference:parsed.data.mealPreference,allergies:parsed.data.allergies,assistance_needs:parsed.data.assistanceNeeds,notes:parsed.data.notes},expected.data||null);await revalidate();return {message:id.data?"Guest updated.":"Guest created.",savedId};}catch(error){return {error:actionError(error)};}
}

export async function createHouseholdPortalLinkAction(wedding:string,household:string):Promise<GuestActionState>{
  const weddingIdResult=z.uuid().safeParse(wedding);const householdId=z.uuid().safeParse(household);
  if(!weddingIdResult.success||!householdId.success)return {error:"Invalid household selection."};
  try{const link=await createHouseholdPortalLink(weddingIdResult.data,householdId.data);await revalidate();return {message:"Private household link created. Any previous link has been revoked.",data:link};}catch(error){return {error:actionError(error)};}
}

export async function revokeHouseholdPortalLinkAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const linkId=z.uuid().safeParse(read(form,"linkId"));
  if(!wedding.success||!linkId.success)return {error:"Invalid household link."};
  try{await revokeHouseholdPortalLink(wedding.data,linkId.data);await revalidate();return {message:"Household link revoked."};}catch(error){return {error:actionError(error)};}
}

export async function setGuestInvitationAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const parsed=values(form,invitationInput);
  if(!wedding.success||!parsed.success)return {error:parsed.success?"Invalid invitation selection.":actionError(parsed.error)};
  try{await setGuestInvitation(wedding.data,parsed.data.guestId,parsed.data.functionId,parsed.data.invited==="true",parsed.data.plusOneAllowed==="true");await revalidate();return {message:"Invitation updated."};}catch(error){return {error:actionError(error)};}
}

export async function recordGuestRsvpAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const parsed=values(form,rsvpInput);
  if(!wedding.success||!parsed.success)return {error:parsed.success?"Invalid response.":actionError(parsed.error)};
  try{await recordGuestRsvp(wedding.data,parsed.data.invitationId,parsed.data.response,parsed.data.source,parsed.data.note,parsed.data.expectedUpdatedAt||null);await revalidate();return {message:"Response recorded."};}catch(error){return {error:actionError(error)};}
}

export async function createPlusOneAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const ids=form.getAll("functionIds").filter((value):value is string=>typeof value==="string");
  const parsed=plusOneInput.safeParse({primaryGuestId:read(form,"primaryGuestId"),fullName:read(form,"fullName"),functionIds:ids});
  if(!wedding.success||!parsed.success)return {error:parsed.success?"Invalid plus-one request.":actionError(parsed.error)};
  try{const savedId=await createGuestPlusOne(wedding.data,parsed.data.primaryGuestId,parsed.data.fullName,parsed.data.functionIds);await revalidate();return {message:"Plus-one added and invited to the selected functions.",savedId};}catch(error){return {error:actionError(error)};}
}

function parseRows(json:string):GuestImportRecord[]{
  const raw:unknown=JSON.parse(json);return guestImportRows.parse(raw);
}
export async function previewGuestDuplicatesAction(wedding:string,rows:GuestImportRecord[]){
  const id=z.uuid().parse(wedding);const safeRows=guestImportRows.parse(rows);
  return suggestGuestDuplicates(id,safeRows.filter(row=>row.errors.length===0));
}
export async function importGuestsAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const hash=z.string().regex(/^[a-f0-9]{64}$/).safeParse(read(form,"fileHash"));const filename=z.string().trim().min(1).max(255).safeParse(read(form,"fileName"));
  const fileContent=read(form,"fileContent");
  if(fileContent.length>250_000)return {error:"CSV files must be no larger than 250 KB."};
  if(hash.success&&createHash("sha256").update(fileContent,"utf8").digest("hex")!==hash.data)return {error:"The import preview no longer matches the selected file. Select it again."};
  let rows:GuestImportRecord[];try{rows=parseRows(read(form,"rowsJson"));}catch(error){return {error:actionError(error)};}
  if(!wedding.success||!hash.success||!filename.success)return {error:"Invalid import batch."};
  try{const batch=await importGuestRows(wedding.data,hash.data,filename.data,rows);await revalidate();return {message:`Import saved: ${batch.imported_count} guests imported, ${batch.review_count} duplicate rows need review, ${batch.error_count} rows have errors.`,savedId:batch.batch_id,data:batch};}catch(error){return {error:actionError(error)};}
}

export async function exportGuestsAction(wedding:string){
  return exportWeddingGuests(z.uuid().parse(wedding));
}

export async function resolveGuestImportDuplicateAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const rowId=z.uuid().safeParse(read(form,"rowId"));
  if(!wedding.success||!rowId.success)return {error:"Invalid import row."};
  try{await resolveGuestImportDuplicate(wedding.data,rowId.data);await revalidate();return {message:"Reviewed row imported as a separate person."};}catch(error){return {error:actionError(error)};}
}

export async function refreshGuestsAction(wedding:string){
  return getGuestWorkspace(z.uuid().parse(wedding));
}

const portalRsvpSchema=portalZ.object({invitationId:portalZ.uuid(),response:portalZ.enum(["yes","no","maybe"]),note:portalZ.string().max(2000),expectedUpdatedAt:portalZ.union([portalZ.literal(""),portalZ.string().datetime()]),submissionKey:portalZ.uuid()});
const portalProfileSchema=portalZ.object({guestId:portalZ.uuid(),mealPreference:portalZ.string().max(500),allergies:portalZ.string().max(2000),assistanceNeeds:portalZ.string().max(2000),expectedUpdatedAt:portalZ.string().datetime(),submissionKey:portalZ.uuid()});

function portalResultError(status:string){
  if(status==="conflict")return "These details changed since this page opened. Refresh to review the latest response before submitting again.";
  if(status==="invalid")return "Check the response and try again.";
  return "This invitation link is no longer available. Please contact your hosts.";
}

export async function recordGuestPortalRsvpAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const parsed=portalRsvpSchema.safeParse(Object.fromEntries(form.entries()));
  if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Check your response."};
  const result=await recordPortalRsvp({...parsed.data,expectedUpdatedAt:parsed.data.expectedUpdatedAt||null});
  if(result.status==="saved"||result.status==="duplicate"){revalidatePath("/guest");return {message:"Your response has been recorded.",savedId:parsed.data.submissionKey};}
  return {error:portalResultError(result.status)};
}

export async function saveGuestPortalProfileAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const parsed=portalProfileSchema.safeParse(Object.fromEntries(form.entries()));
  if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Check the dietary and assistance details."};
  const result=await recordPortalGuestProfile(parsed.data);
  if(result.status==="saved"||result.status==="duplicate"){revalidatePath("/guest");return {message:"Your information has been updated.",savedId:parsed.data.submissionKey};}
  return {error:portalResultError(result.status)};
}
