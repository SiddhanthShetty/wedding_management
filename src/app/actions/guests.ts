"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { createGuestPlusOne, createGuestPortalLink, deleteGuest, deleteGuestHousehold, exportWeddingGuests, getGuestWorkspace, importGuestRows, recordGuestRsvp, resolveGuestImportDuplicate, revokeGuestPortalLink, saveGuest, saveGuestHousehold, setGuestInvitation, setGuestInvitationsBulk, setGuestPortalProxies, suggestGuestDuplicates, type GuestImportRecord } from "@/lib/data/guests";
import { guestImportRows, guestInput, guestInvitationChangesInput, householdInput, invitationInput, isoTimestampInput, plusOneInput, rsvpInput } from "@/lib/planning/guest-inputs";
import { recordPortalGuestProfile, recordPortalRsvps } from "@/lib/guest-portal/server";
import { z as portalZ } from "zod";
import { guestPortalRsvpBatchInput } from "@/lib/planning/guest-inputs";

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

export async function deleteGuestAction(wedding:string,guest:string,expectedUpdatedAt:string):Promise<GuestActionState>{
  const weddingResult=z.uuid().safeParse(wedding);const guestResult=z.uuid().safeParse(guest);const expected=isoTimestampInput.safeParse(expectedUpdatedAt);
  if(!weddingResult.success||!guestResult.success||!expected.success)return {error:"Invalid guest selection. Refresh the page and try again."};
  try{await deleteGuest(weddingResult.data,guestResult.data,expected.data);await revalidate();revalidatePath("/logistics");return {message:"Guest and their invitation records were deleted."};}
  catch(error){if(error instanceof AuthorizationDeniedError)return {error:"Your guest edit access is no longer available. Refresh and try again."};return {error:error instanceof Error?error.message:"Could not delete this guest. No deletion was recorded."};}
}

export async function deleteGuestHouseholdAction(wedding:string,household:string,deleteMembers:boolean):Promise<GuestActionState>{
  const weddingResult=z.uuid().safeParse(wedding);const householdResult=z.uuid().safeParse(household);const deleteMembersResult=z.boolean().safeParse(deleteMembers);
  if(!weddingResult.success||!householdResult.success||!deleteMembersResult.success)return {error:"Invalid household selection. Refresh the page and try again."};
  try{const count=await deleteGuestHousehold(weddingResult.data,householdResult.data,deleteMembersResult.data);await revalidate();revalidatePath("/logistics");return {message:`Household deleted with ${count} individual guest${count===1?"":"s"} and their invitation records.`};}
  catch(error){if(error instanceof AuthorizationDeniedError)return {error:"Your guest edit access is no longer available. Refresh and try again."};return {error:error instanceof Error?error.message:"Could not delete this household. No deletion was recorded."};}
}

export async function saveHouseholdAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const parsed=values(form,householdInput);const id=z.union([z.literal(""),z.uuid()]).safeParse(read(form,"householdId"));
  if(!wedding.success||!parsed.success||!id.success)return {error:parsed.success?"Invalid household details.":actionError(parsed.error)};
  try{const savedId=await saveGuestHousehold(wedding.data,id.data||null,{name:parsed.data.name,contact_name:parsed.data.contactName,contact_email:parsed.data.contactEmail,contact_phone:parsed.data.contactPhone,address:parsed.data.address,notes:parsed.data.notes,family_side:parsed.data.familySide});await revalidate();return {message:id.data?"Household updated.":"Household created.",savedId};}catch(error){return {error:actionError(error)};}
}

export async function saveGuestAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const parsed=values(form,guestInput);const id=z.union([z.literal(""),z.uuid()]).safeParse(read(form,"guestId"));const expected=z.union([z.literal(""),isoTimestampInput]).safeParse(read(form,"expectedUpdatedAt"));
  if(!wedding.success||!parsed.success||!id.success||!expected.success)return {error:parsed.success?"Invalid guest selection.":actionError(parsed.error)};
  if(!parsed.data.householdId)return {error:"Choose a household for this guest."};
  try{const savedId=await saveGuest(wedding.data,id.data||null,{household_id:parsed.data.householdId,full_name:parsed.data.fullName,email:parsed.data.email,phone:parsed.data.phone,follow_up_owner_user_id:parsed.data.followUpOwnerUserId||null,meal_preference:parsed.data.mealPreference,allergies:parsed.data.allergies,assistance_needs:parsed.data.assistanceNeeds,notes:parsed.data.notes},expected.data||null);await revalidate();return {message:id.data?"Guest updated.":"Guest created.",savedId};}catch(error){return {error:actionError(error)};}
}

export async function createGuestPortalLinkAction(wedding:string,guest:string,proxyGuests:unknown=[]):Promise<GuestActionState>{
  const weddingIdResult=z.uuid().safeParse(wedding);const guestId=z.uuid().safeParse(guest);const proxies=z.array(z.uuid()).max(20).safeParse(proxyGuests);
  if(!weddingIdResult.success||!guestId.success||!proxies.success||new Set(proxies.data).size!==proxies.data.length)return {error:"Invalid guest or proxy selection."};
  try{const link=await createGuestPortalLink(weddingIdResult.data,guestId.data,proxies.data);await revalidate();return {message:"Individual private link created. Any previous link for this guest has been revoked.",data:link};}catch(error){return {error:actionError(error)};}
}

export async function setGuestPortalProxiesAction(wedding:string,link:string,proxyGuests:unknown):Promise<GuestActionState>{
  const weddingIdResult=z.uuid().safeParse(wedding);const linkId=z.uuid().safeParse(link);const proxies=z.array(z.uuid()).max(20).safeParse(proxyGuests);
  if(!weddingIdResult.success||!linkId.success||!proxies.success||new Set(proxies.data).size!==proxies.data.length)return {error:"Invalid guest or proxy selection."};
  try{await setGuestPortalProxies(weddingIdResult.data,linkId.data,proxies.data);await revalidate();return {message:"Proxy access updated."};}catch(error){return {error:actionError(error)};}
}

export async function revokeGuestPortalLinkAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const linkId=z.uuid().safeParse(read(form,"linkId"));
  if(!wedding.success||!linkId.success)return {error:"Invalid guest link."};
  try{await revokeGuestPortalLink(wedding.data,linkId.data);await revalidate();return {message:"Individual link revoked."};}catch(error){return {error:actionError(error)};}
}

export async function setGuestInvitationAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const wedding=weddingId(form);const parsed=values(form,invitationInput);
  if(!wedding.success||!parsed.success)return {error:parsed.success?"Invalid invitation selection.":actionError(parsed.error)};
  try{await setGuestInvitation(wedding.data,parsed.data.guestId,parsed.data.functionId,parsed.data.invited==="true",parsed.data.plusOneAllowed==="true");await revalidate();return {message:"Invitation updated."};}catch(error){return {error:actionError(error)};}
}

export async function saveGuestInvitationsBulkAction(wedding:string,entries:unknown):Promise<GuestActionState>{
  const weddingResult=z.uuid().safeParse(wedding);
  const parsed=guestInvitationChangesInput.safeParse(entries);
  if(!weddingResult.success)return {error:"Invalid wedding selection."};
  if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Check the invitation changes and try again."};
  try{
    const count=await setGuestInvitationsBulk(weddingResult.data,parsed.data);
    await revalidate();
    return {message:`${count} invitation changes saved together.`};
  }catch(error){
    if(error instanceof AuthorizationDeniedError)return {error:"Your guest edit access is no longer available. Refresh and try again."};
    return {error:error instanceof Error?error.message:"Could not save the invitation changes."};
  }
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

const portalProfileSchema=portalZ.object({guestId:portalZ.uuid(),mealPreference:portalZ.string().max(500),allergies:portalZ.string().max(2000),assistanceNeeds:portalZ.string().max(2000),expectedUpdatedAt:isoTimestampInput,submissionKey:portalZ.uuid()});

function portalResultError(status:string){
  if(status==="conflict")return "These details changed since this page opened. Refresh to review the latest response before submitting again.";
  if(status==="invalid")return "Check the response and try again.";
  return "This invitation link is no longer available. Please contact your hosts.";
}

export async function recordGuestPortalRsvpBatchAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const raw=form.get("responsesJson");
  if(typeof raw!=="string"||raw.length>32_000)return {error:"Check the responses and try again."};
  let payload:unknown;
  try{payload=JSON.parse(raw);}catch{return {error:"Check the responses and try again."};}
  const parsed=guestPortalRsvpBatchInput.safeParse(payload);
  if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Choose a response for each invited function."};
  const result=await recordPortalRsvps({
    guestId:parsed.data.guestId,
    responses:parsed.data.responses.map((entry)=>({...entry,expectedUpdatedAt:entry.expectedUpdatedAt||null})),
  });
  if(result.status==="saved"||result.status==="duplicate"){
    revalidatePath("/guest");
    const count=result.saved_count??parsed.data.responses.length;
    return {message:result.status==="duplicate"?"These responses were already saved.":`${count} response${count===1?"":"s"} saved together.`,savedId:parsed.data.submissionKey};
  }
  return {error:portalResultError(result.status)};
}

export async function saveGuestPortalProfileAction(_state:GuestActionState,form:FormData):Promise<GuestActionState>{
  const parsed=portalProfileSchema.safeParse(Object.fromEntries(form.entries()));
  if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Check the dietary and assistance details."};
  const result=await recordPortalGuestProfile(parsed.data);
  if(result.status==="saved"||result.status==="duplicate"){revalidatePath("/guest");return {message:"Your information has been updated.",savedId:parsed.data.submissionKey};}
  return {error:portalResultError(result.status)};
}
