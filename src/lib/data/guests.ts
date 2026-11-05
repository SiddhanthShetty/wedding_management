import "server-only";

import { authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCsv } from "@/lib/planning/guest-csv";
import { guestImportRows, guestInvitationChangesInput } from "@/lib/planning/guest-inputs";
import { digestGuestPortalValue, newGuestPortalToken } from "@/lib/guest-portal/crypto";

type Row=Record<string,any>;
export type GuestImportRecord={rowNumber:number;raw:Record<string,string>;fullName:string;householdName:string;email:string;phone:string;familySide:"couple_one"|"couple_two"|"shared"|"unknown";mealPreference:string;allergies:string;assistanceNeeds:string;errors:string[];allowDuplicate:boolean};
const required=(error:unknown,message:string)=>{if(error)throw new Error(message);};
function canEdit(context:Awaited<ReturnType<typeof authorizeWeddingOperation>>){return context.membership.role==="owner"||context.membership.role==="co_owner"||context.moduleAccess.guests==="edit";}

export async function getGuestWorkspace(weddingId:string){
  const context=await authorizeWeddingOperation(weddingId,"guests","read");
  const supabase=await createSupabaseServerClient();
  const results=await Promise.all([
    supabase.from("guest_households").select("id,name,contact_name,contact_email,contact_phone,address,notes,created_at,updated_at").eq("wedding_id",weddingId).order("name"),
    supabase.from("guests").select("id,household_id,plus_one_for_guest_id,full_name,email,phone,family_side,follow_up_owner_user_id,meal_preference,allergies,assistance_needs,notes,created_at,updated_at").eq("wedding_id",weddingId).order("full_name"),
    supabase.from("functions").select("id,name,function_date,status,archived_at").eq("wedding_id",weddingId).order("function_date"),
    supabase.from("guest_invitations").select("id,function_id,guest_id,invitation_kind,plus_one_for_guest_id,status,plus_one_allowed,created_at,updated_at,invited_by_user_id").eq("wedding_id",weddingId).order("created_at"),
    supabase.from("guest_rsvps").select("id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at,updated_at").eq("wedding_id",weddingId),
    supabase.from("guest_rsvp_history").select("id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at,created_at").eq("wedding_id",weddingId).order("created_at",{ascending:false}).limit(500),
    supabase.from("guest_import_batches").select("id,file_name,row_count,imported_count,review_count,error_count,created_at,created_by_user_id").eq("wedding_id",weddingId).order("created_at",{ascending:false}).limit(20),
    supabase.from("guest_import_rows").select("id,batch_id,row_number,status,errors,duplicate_guest_ids,normalized_data").eq("wedding_id",weddingId).order("row_number").limit(500),
    supabase.from("wedding_members").select("user_id,created_at").eq("wedding_id",weddingId).eq("status","active").order("created_at"),
  ]);
  for(const result of results)required(result.error,"Could not load the guest workspace.");
  const [households,guests,functions,invitations,rsvps,history,batches,importRows,members]=results.map(result=>(result.data??[]) as Row[]);
  const profileIds=[...new Set([...members!.map(row=>row.user_id),...guests!.map(row=>row.follow_up_owner_user_id).filter(Boolean),...rsvps!.map(row=>row.recorded_by_user_id).filter(Boolean),...invitations!.map(row=>row.invited_by_user_id).filter(Boolean)])];
  const profileResult=profileIds.length?await supabase.from("profiles").select("id,display_name").in("id",profileIds):{data:[],error:null};
  required(profileResult.error,"Could not load guest workspace member names.");
  const profileNames=new Map((profileResult.data??[]).map(row=>[row.id,row.display_name||"Wedding member"]));
  const householdNames=new Map(households!.map(row=>[row.id,row.name]));
  const guestsWithDetails=guests!.map(guest=>({...guest,household_name:guest.household_id?householdNames.get(guest.household_id)??"Household":"No household",plus_one_for_name:guest.plus_one_for_guest_id?guests!.find(row=>row.id===guest.plus_one_for_guest_id)?.full_name??null:null,follow_up_owner_name:guest.follow_up_owner_user_id?profileNames.get(guest.follow_up_owner_user_id)??"Wedding member":"Unassigned"}));
  const invitationDTOs:Row[]=invitations!.map(invitation=>{const response=rsvps!.find(row=>row.invitation_id===invitation.id);return {...invitation,guest_name:guests!.find(row=>row.id===invitation.guest_id)?.full_name??"Guest",function_name:functions!.find(row=>row.id===invitation.function_id)?.name??"Function",rsvp:response?{...response,recorded_by_name:response.recorded_by_user_id?profileNames.get(response.recorded_by_user_id)??"Wedding member":"Guest portal"}:null,invited_by_name:profileNames.get(invitation.invited_by_user_id)??"Wedding member"};});
  const functionSummaries=functions!.filter(row=>!row.archived_at&&row.status!=="cancelled").map(fn=>{
    const rows=invitationDTOs.filter(row=>row.function_id===fn.id&&row.status==="invited");
    return {id:fn.id,name:fn.name,date:fn.function_date,invited:rows.length,yes:rows.filter(row=>row.rsvp?.response==="yes").length,no:rows.filter(row=>row.rsvp?.response==="no").length,maybe:rows.filter(row=>row.rsvp?.response==="maybe").length,pending:rows.filter(row=>!row.rsvp).length};
  });
  const followUpOwners=members!.map(member=>({userId:member.user_id,name:profileNames.get(member.user_id)??"Wedding member"}));
  const guestNames=new Map(guests!.map(row=>[row.id,row.full_name]));
  const portalLinksResult=await supabase.rpc("list_guest_portal_links",{p_wedding_id:weddingId,p_household_id:null});
  required(portalLinksResult.error,"Could not load household portal links.");
  const portalLinks=(portalLinksResult.data??[]) as Row[];
  return {weddingId,canEdit:canEdit(context),households:households!,guests:guestsWithDetails,functions:functions!,invitations:invitationDTOs,rsvpHistory:history!.map(row=>({...row,author_name:row.recorded_by_user_id?profileNames.get(row.recorded_by_user_id)??"Wedding member":"Guest portal"})),functionSummaries,batches:batches!.map(row=>({...row,author_name:profileNames.get(row.created_by_user_id)??"Wedding member",rows:importRows!.filter(item=>item.batch_id===row.id).map(item=>({...item,duplicate_guest_names:item.duplicate_guest_ids.map((id:string)=>guestNames.get(id)??"Guest")}))})),portalLinks,followUpOwners};
}

export async function saveGuestHousehold(weddingId:string,householdId:string|null,values:Record<string,unknown>){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("save_guest_household",{p_wedding_id:weddingId,p_household_id:householdId,p_values:values});
  if(error||!data)throw new Error("Could not save this household.");return data as string;
}
export async function saveGuest(weddingId:string,guestId:string|null,values:Record<string,unknown>,expectedUpdatedAt:string|null){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("save_guest",{p_wedding_id:weddingId,p_guest_id:guestId,p_values:values,p_expected_updated_at:expectedUpdatedAt});
  if(error?.code==="40001")throw new Error("Guest details changed after this form opened. Refresh the page, review the latest values, and try again.");
  if(error||!data)throw new Error("Could not save this guest. Confirm the selected household and follow-up owner belong to this wedding.");return data as string;
}

export async function createHouseholdPortalLink(weddingId:string,householdId:string){
  await authorizeWeddingOperation(weddingId,"guests","edit");
  const token=newGuestPortalToken();const tokenDigest=digestGuestPortalValue("link",token);const expiresAt=new Date(Date.now()+30*24*60*60*1000).toISOString();
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("create_guest_portal_link",{p_wedding_id:weddingId,p_household_id:householdId,p_token_digest:tokenDigest,p_expires_at:expiresAt});
  if(error||!data)throw new Error("Could not create a private household link. Confirm you have guest edit access and the household still exists.");
  return {id:data as string,token,expiresAt};
}

export async function revokeHouseholdPortalLink(weddingId:string,linkId:string){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("revoke_guest_portal_link",{p_wedding_id:weddingId,p_link_id:linkId});
  if(error||data!==true)throw new Error("Could not revoke this household link. Refresh and try again.");
}
export async function setGuestInvitation(weddingId:string,guestId:string,functionId:string,invited:boolean,plusOneAllowed:boolean){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("set_guest_invitation",{p_wedding_id:weddingId,p_guest_id:guestId,p_function_id:functionId,p_invited:invited,p_plus_one_allowed:plusOneAllowed});
  if(error||!data)throw new Error("Could not update this invitation. Confirm the guest and function are active.");return data as string;
}
export async function setGuestInvitationsBulk(weddingId:string,entries:unknown){
  await authorizeWeddingOperation(weddingId,"guests","edit");
  const parsed=guestInvitationChangesInput.parse(entries);
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("set_guest_invitations_bulk",{
    p_wedding_id:weddingId,
    p_invitations:parsed.map(entry=>({guest_id:entry.guestId,function_id:entry.functionId,invited:entry.invited,plus_one_allowed:entry.plusOneAllowed})),
  });
  if(error||data!==parsed.length)throw new Error("Could not save all invitation changes. No changes were saved; check active functions and approved plus-ones, then retry.");
  return data as number;
}
export async function createGuestPlusOne(weddingId:string,primaryGuestId:string,name:string,functionIds:string[]){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("create_guest_plus_one",{p_wedding_id:weddingId,p_primary_guest_id:primaryGuestId,p_full_name:name,p_function_ids:functionIds});
  if(error||!data)throw new Error("Could not add the plus-one. Approval must be active for every selected function, and each guest may have at most one plus-one.");return data as string;
}
export async function recordGuestRsvp(weddingId:string,invitationId:string,response:string,source:string,note:string,expectedUpdatedAt:string|null){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("record_guest_rsvp",{p_wedding_id:weddingId,p_invitation_id:invitationId,p_response:response,p_source:source,p_note:note,p_expected_updated_at:expectedUpdatedAt});
  if(error?.code==="40001")throw new Error("RSVP edit conflict. Refresh to review the latest response before saving.");
  if(error||!data)throw new Error("Could not record this response. Confirm the invitation is active and refresh to check for a newer response.");return data as string;
}

function normalizeEmail(value:string){return value.trim().toLocaleLowerCase();}
function normalizePhone(value:string){return value.replace(/\D/g,"");}
export async function suggestGuestDuplicates(weddingId:string,rows:GuestImportRecord[]){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const [guestResult,householdResult]=await Promise.all([
    supabase.from("guests").select("id,full_name,email,phone,household_id").eq("wedding_id",weddingId),
    supabase.from("guest_households").select("id,name").eq("wedding_id",weddingId),
  ]);
  required(guestResult.error||householdResult.error,"Could not check possible duplicate people.");
  const names=new Map((householdResult.data??[]).map(row=>[row.id,row.name]));
  return rows.map(row=>({rowNumber:row.rowNumber,suggestions:(guestResult.data??[]).filter(guest=>
    (normalizeEmail(row.email)!==""&&normalizeEmail(guest.email)===normalizeEmail(row.email))
    ||(normalizePhone(row.phone)!==""&&normalizePhone(guest.phone)===normalizePhone(row.phone))
    ||(guest.full_name.trim().toLocaleLowerCase()===row.fullName.trim().toLocaleLowerCase()&&(names.get(guest.household_id??"")??"").trim().toLocaleLowerCase()===row.householdName.trim().toLocaleLowerCase())
  ).slice(0,5).map(guest=>({id:guest.id,name:guest.full_name,household:names.get(guest.household_id??"")??"No household"}))}));
}
export async function importGuestRows(weddingId:string,fileHash:string,fileName:string,rows:GuestImportRecord[]){
  await authorizeWeddingOperation(weddingId,"guests","edit");const parsed=guestImportRows.parse(rows);const supabase=await createSupabaseServerClient();
  const pRows=parsed.map(row=>({row_number:row.rowNumber,raw:row.raw,guest:{full_name:row.fullName,household_name:row.householdName,email:row.email,phone:row.phone,family_side:row.familySide,meal_preference:row.mealPreference,allergies:row.allergies,assistance_needs:row.assistanceNeeds},errors:row.errors,allow_duplicate:row.allowDuplicate}));
  const {data,error}=await supabase.rpc("import_guest_rows",{p_wedding_id:weddingId,p_file_hash:fileHash,p_file_name:fileName,p_rows:pRows});
  if(error||!data)throw new Error(error?.message.includes("already imported")?"This exact file has already been imported for this wedding.":"Could not save the import batch. Check the preview and retry.");
  return data as {batch_id:string;imported_count:number;review_count:number;error_count:number};
}
export async function resolveGuestImportDuplicate(weddingId:string,rowId:string){
  await authorizeWeddingOperation(weddingId,"guests","edit");const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.rpc("resolve_guest_import_duplicate",{p_wedding_id:weddingId,p_import_row_id:rowId,p_confirm_as_new:true});
  if(error||!data)throw new Error("Could not resolve this duplicate. Refresh and confirm the row is still awaiting review.");return data as string;
}

export async function exportWeddingGuests(weddingId:string){
  const context=await authorizeWeddingOperation(weddingId,"guests","read");const supabase=await createSupabaseServerClient();
  const [households,guests,functions,invitations,rsvps]=await Promise.all([
    supabase.from("guest_households").select("id,name").eq("wedding_id",weddingId),
    supabase.from("guests").select("id,household_id,full_name,email,phone,family_side,meal_preference,allergies,assistance_needs").eq("wedding_id",weddingId).order("full_name"),
    supabase.from("functions").select("id,name").eq("wedding_id",weddingId),
    supabase.from("guest_invitations").select("id,guest_id,function_id,status").eq("wedding_id",weddingId),
    supabase.from("guest_rsvps").select("invitation_id,response,response_source,responded_at").eq("wedding_id",weddingId),
  ]);
  required(households.error||guests.error||functions.error||invitations.error||rsvps.error,"Could not export guest records.");
  const detailed=context.membership.role==="owner"||context.membership.role==="co_owner"||context.moduleAccess.guests==="edit";
  const headers=detailed?["Name","Household","Family side","Email","Phone","Meal preference","Allergies","Assistance needs","Function invitations"]:["Name","Household","Family side","Function invitations"];
  const householdName=new Map((households.data??[]).map(row=>[row.id,row.name]));const functionName=new Map((functions.data??[]).map(row=>[row.id,row.name]));
  const rows=(guests.data??[]).map(guest=>{
    const personInvites=(invitations.data??[]).filter(inv=>inv.guest_id===guest.id).map(inv=>{const rsvp=(rsvps.data??[]).find(response=>response.invitation_id===inv.id);return `${functionName.get(inv.function_id)??"Function"}: ${inv.status}${rsvp?` (${rsvp.response}; ${rsvp.response_source}; ${rsvp.responded_at})`:" (awaiting response)"}`;});
    const row:Record<string,unknown>={"Name":guest.full_name,"Household":householdName.get(guest.household_id??"")??"","Family side":guest.family_side,"Email":guest.email,"Phone":guest.phone,"Meal preference":guest.meal_preference,"Allergies":guest.allergies,"Assistance needs":guest.assistance_needs,"Function invitations":personInvites.join(" | ")};
    return row;
  });
  return createCsv(headers,rows);
}
