"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { buildItinerary, functionIcs, mapLink } from "@/lib/guest-portal/itinerary";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarPlus, Heart, MapPin } from "lucide-react";
import { recordGuestPortalRsvpBatchAction, saveGuestPortalProfileAction, type GuestActionState } from "@/app/actions/guests";
import type { GuestPortalData, PortalGuest, PortalInvitation } from "@/lib/guest-portal/server";
import { Button } from "@/components/ui";
import { InvitationCard } from "@/components/invitation-card";
import { buildCardProps } from "@/lib/invitations/card-data";
import { isLanguage, THEMES, type LanguageCode, type ThemeId } from "@/lib/invitations/content";

const initial: GuestActionState = {};
const unavailableCopy = "This invitation link is not available. Please contact your hosts for help.";

function TokenExchange() {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Checking your private invitation…");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    // Remove the bearer token from the address bar/history before making a request.
    window.history.replaceState(null, "", "/guest");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setMessage(unavailableCopy); return; }
    void fetch("/api/guest-portal/exchange", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (!response.ok) { setMessage(unavailableCopy); return; }
      router.replace("/guest");
      router.refresh();
    }).catch(() => setMessage(unavailableCopy));
  }, [router]);
  return <PortalFrame><div className="guest-portal-state" role="status"><span className="guest-portal-heart"><Heart size={18}/></span><h1>Private invitation</h1><p>{message}</p></div></PortalFrame>;
}

function PortalFrame({children}:{children:React.ReactNode}) {
  return <main className="guest-portal-main"><div className="guest-portal-brand"><span className="guest-portal-heart"><Heart size={17}/></span><span>Wedding invitation</span></div>{children}<p className="guest-portal-footer">A private invitation for you and your household</p></main>;
}

function formatDate(value:string|null) {
  if (!value) return "Date to be confirmed";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-IE",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(parsed);
}
function formatTime(value:string|null) {
  if (!value) return "";
  const parsed = new Date(`2000-01-01T${value}Z`);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-IE",{hour:"numeric",minute:"2-digit",timeZone:"UTC"}).format(parsed);
}

type PortalRsvpDraft={response:""|"yes"|"no"|"maybe";note:string};

const RESPONSE_OPTIONS=[{value:"yes",label:"Yes, attending"},{value:"no",label:"Can't attend"},{value:"maybe",label:"Not sure yet"}] as const;
function RsvpFields({invitation,draft,onChange}:{invitation:PortalInvitation;draft:PortalRsvpDraft;onChange:(next:PortalRsvpDraft)=>void}){
  return <div className="guest-portal-form">
    <fieldset className="rsvp-choice">
      <legend className="guest-portal-label">Your response for {invitation.function.name}</legend>
      {RESPONSE_OPTIONS.map((option)=><label key={option.value} className={`rsvp-option rsvp-${option.value} ${draft.response===option.value?"is-selected":""}`}>
        <input type="radio" name={`rsvp-${invitation.id}`} value={option.value} checked={draft.response===option.value} onChange={()=>onChange({...draft,response:option.value})}/>
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    <details className="rsvp-note" open={Boolean(draft.note)}>
      <summary>Add a note for your hosts</summary>
      <label className="sr-only" htmlFor={`rsvp-note-${invitation.id}`}>Note for your hosts (optional)</label>
      <textarea id={`rsvp-note-${invitation.id}`} className="guest-portal-input" rows={2} maxLength={2000} value={draft.note} onChange={(event)=>onChange({...draft,note:event.currentTarget.value})}/>
    </details>
  </div>;
}

function PersonRsvpForm({person}:{person:PortalGuest}){
  const [state,action,pending]=useActionState(recordGuestPortalRsvpBatchAction,initial);
  const [drafts,setDrafts]=useState<Record<string,PortalRsvpDraft>>(()=>Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,{response:invitation.response??"",note:invitation.response_note??""}])));
  const [submissionKeys,setSubmissionKeys]=useState<Record<string,string>>({});
  const [batchSubmissionKey,setBatchSubmissionKey]=useState("");
  const router=useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const [submitAfterUpdate,setSubmitAfterUpdate]=useState(false);
  const acceptAll=()=>setDrafts((current)=>Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,{note:current[invitation.id]?.note??"",response:"yes"}])));
  // "Everyone is coming to everything" for the household: accept all, then save this person's form.
  useEffect(()=>{
    const onAll=()=>{acceptAll();setSubmitAfterUpdate(true);};
    window.addEventListener("portal:accept-all",onAll);
    return ()=>window.removeEventListener("portal:accept-all",onAll);
  });

  useEffect(()=>{
    setSubmissionKeys(Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,crypto.randomUUID()])));
    setBatchSubmissionKey(crypto.randomUUID());
  },[person.id]);
  useEffect(()=>{
    if(state.message&&state.savedId===batchSubmissionKey){
      setSubmissionKeys(Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,crypto.randomUUID()])));
      setBatchSubmissionKey(crypto.randomUUID());
      router.refresh();
    }
  },[state.message,state.savedId,batchSubmissionKey,person.invitations,router]);
  const changed=person.invitations.filter((invitation)=>{
    const draft=drafts[invitation.id];
    return draft&&(draft.response!==(invitation.response??"")||draft.note!==(invitation.response_note??""));
  });
  // Only submit when "accept all" actually changed something for this person.
  useEffect(()=>{ if(submitAfterUpdate){setSubmitAfterUpdate(false);if(changed.length)formRef.current?.requestSubmit();} },[submitAfterUpdate,changed.length]);
  const responses=JSON.stringify({
    guestId:person.id,
    submissionKey:batchSubmissionKey,
    responses:changed.map((invitation)=>({
      invitationId:invitation.id,
      response:drafts[invitation.id]!.response,
      note:drafts[invitation.id]!.note,
      expectedUpdatedAt:invitation.updated_at??"",
      submissionKey:submissionKeys[invitation.id]??"",
    })),
  });
  return <form ref={formRef} action={action} className="guest-portal-rsvp-batch">
    {person.invitations.length>1&&<button type="button" className="rsvp-all" onClick={acceptAll}>Yes to all for {person.full_name}</button>}
    <div className="guest-portal-functions">{person.invitations.map((invitation)=><FunctionCard key={invitation.id} invitation={invitation}><RsvpFields invitation={invitation} draft={drafts[invitation.id]??{response:"",note:""}} onChange={(next)=>setDrafts((current)=>({...current,[invitation.id]:next}))}/></FunctionCard>)}</div>
    <input type="hidden" name="responsesJson" value={responses}/>
    {state.error&&<p className="guest-portal-error" role="alert">{state.error}</p>}{state.message&&<p className="guest-portal-success" role="status">{state.message}</p>}
    <Button type="submit" disabled={pending||!batchSubmissionKey||!changed.length}>{pending?"Saving responses…":"Save all responses"}</Button>
  </form>;
}

function GuestProfileForm({person}:{person:PortalGuest}) {
  const [state,action,pending]=useActionState(saveGuestPortalProfileAction,initial);
  const [submissionKey,setSubmissionKey]=useState("");
  const router=useRouter();
  useEffect(()=>setSubmissionKey(crypto.randomUUID()),[]);
  useEffect(()=>{if(state.message&&state.savedId===submissionKey){setSubmissionKey(crypto.randomUUID());router.refresh();}},[state.message,state.savedId,submissionKey,router]);
  return <details className="guest-portal-dietary"><summary>Dietary and assistance information</summary><p>Only your meal preference, allergies, and assistance needs are shared with your hosts.</p>
    <form key={person.updated_at} action={action} className="guest-portal-form">
      <input type="hidden" name="guestId" value={person.id}/><input type="hidden" name="expectedUpdatedAt" value={person.updated_at}/><input type="hidden" name="submissionKey" value={submissionKey}/>
      <label className="guest-portal-label" htmlFor={`meal-${person.id}`}>Meal preference</label><textarea id={`meal-${person.id}`} className="guest-portal-input" name="mealPreference" rows={2} maxLength={500} defaultValue={person.meal_preference}/>
      <label className="guest-portal-label" htmlFor={`allergies-${person.id}`}>Allergies</label><textarea id={`allergies-${person.id}`} className="guest-portal-input" name="allergies" rows={2} maxLength={2000} defaultValue={person.allergies}/>
      <label className="guest-portal-label" htmlFor={`assistance-${person.id}`}>Assistance needs</label><textarea id={`assistance-${person.id}`} className="guest-portal-input" name="assistanceNeeds" rows={2} maxLength={2000} defaultValue={person.assistance_needs}/>
      {state.error&&<p className="guest-portal-error" role="alert">{state.error}</p>}{state.message&&<p className="guest-portal-success" role="status">{state.message}</p>}
      <Button type="submit" variant="secondary" disabled={pending||!submissionKey}>{pending?"Saving…":"Save information"}</Button>
    </form>
  </details>;
}

function FunctionCard({invitation,children}:{invitation:PortalInvitation;children:React.ReactNode}) {
  const fn=invitation.function;
  const start=fn.start_time?formatTime(fn.start_time):"";
  const end=fn.end_time?formatTime(fn.end_time):"";
  return <article className="guest-portal-function">
    <div className="guest-portal-function-heading"><div><p className="guest-portal-eyebrow">{fn.type}</p><h3>{fn.name}</h3></div><span className={`guest-portal-status ${fn.status}`}>{fn.status==="confirmed"?"Confirmed":"Tentative"}</span></div>
    <p className="guest-portal-date">{formatDate(fn.date)} <span>· {fn.timezone}</span></p>
    {(start||end)&&<p className="guest-portal-meta">{start||"Time to be confirmed"}{end?` – ${end}${start&&fn.end_time!.slice(0,8)<fn.start_time!.slice(0,8)?" (ends next day)":""}`:""}</p>}
    {fn.location&&<p className="guest-portal-meta"><MapPin size={15} aria-hidden="true"/> {fn.location}</p>}
    {fn.dress_code&&<p className="guest-portal-meta"><strong>Dress code:</strong> {fn.dress_code}</p>}
    {fn.map_url&&<a className="guest-portal-map" href={fn.map_url} target="_blank" rel="noopener noreferrer">Open map <ArrowUpRight size={14}/></a>}
    {children}
  </article>;
}

function HouseholdAcceptAll({count}:{count:number}){
  const [confirming,setConfirming]=useState(false);
  return <section className="guest-portal-person household-accept">
    <h2>Replying for everyone?</h2>
    {!confirming?<button type="button" className="rsvp-all" onClick={()=>setConfirming(true)}>{count>1?"We're all coming to everything":"I'm coming to everything"}</button>:<>
      <p>This saves “Yes, attending” for every invitation{count>1?` for all ${count} people`:""}. You can still change any answer afterwards.</p>
      <div className="guest-portal-link-actions"><Button type="button" onClick={()=>{window.dispatchEvent(new Event("portal:accept-all"));setConfirming(false);}}>Yes, save for everyone</Button><Button type="button" variant="secondary" onClick={()=>setConfirming(false)}>Cancel</Button></div>
    </>}
  </section>;
}

function downloadIcs(fn:Parameters<typeof functionIcs>[0]){
  const ics=functionIcs(fn);if(!ics)return;
  const url=URL.createObjectURL(new Blob([ics],{type:"text/calendar;charset=utf-8"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=`${fn.name.replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"")||"event"}.ics`;anchor.click();URL.revokeObjectURL(url);
}

function PortalItinerary({data}:{data:GuestPortalData}){
  const entries=buildItinerary(data.people);
  if(!entries.length)return null;
  const everyone=data.people.length;
  const who=(people:string[])=>people.length===everyone&&everyone>1?"Everyone":people.join(", ");
  return <section className="guest-portal-person itinerary" aria-labelledby="itinerary-title">
    <div className="guest-portal-person-heading"><h2 id="itinerary-title">Your plan</h2><span>{entries.length} {entries.length===1?"item":"items"}</span></div>
    <ol className="itinerary-list">{entries.map((entry)=><li key={entry.key} className={`itinerary-item itinerary-${entry.type}`}>
      <p className="itinerary-date">{formatDate(entry.date)}</p>
      {entry.type==="function"&&<>
        <p className="itinerary-title">{entry.fn.name}{entry.fn.start_time?` · ${formatTime(entry.fn.start_time)}`:""}{entry.fn.status==="tentative"?" · timing to be confirmed":""}</p>
        <p className="guest-portal-meta">{[entry.fn.location,entry.fn.dress_code&&`Dress code: ${entry.fn.dress_code}`].filter(Boolean).join(" · ")}</p>
        <p className="guest-portal-meta">{who(entry.people)}</p>
        <div className="guest-portal-link-actions">
          {entry.fn.date&&<button type="button" className="itinerary-action" onClick={()=>downloadIcs(entry.fn)}><CalendarPlus size={15} aria-hidden="true"/> Add to calendar</button>}
          {mapLink(entry.fn)&&<a className="itinerary-action" href={mapLink(entry.fn)!} target="_blank" rel="noopener noreferrer"><MapPin size={15} aria-hidden="true"/> Map</a>}
        </div>
      </>}
      {entry.type==="stay"&&<><p className="itinerary-title">Stay at {entry.stay.property}</p><p className="guest-portal-meta">Until {formatDate(entry.stay.check_out_date)} · {who(entry.people)}</p></>}
      {entry.type==="ride"&&<><p className="itinerary-title">{entry.ride.kind==="arrival"?"Pickup":entry.ride.kind==="departure"?"Departure ride":"Ride"} · {new Intl.DateTimeFormat("en-IE",{hour:"numeric",minute:"2-digit",timeZone:entry.ride.timezone}).format(new Date(entry.ride.pickup_at))}</p><p className="guest-portal-meta">{entry.ride.pickup_location} → {entry.ride.dropoff_location} · {who(entry.people)}</p></>}
    </li>)}</ol>
  </section>;
}

function PortalInvitationCard({data}:{data:GuestPortalData}){
  if(!data.invitation)return null;
  const language=isLanguage(data.household.language??"en")?data.household.language as LanguageCode:"en";
  const seen=new Map<string,PortalInvitation["function"]>();
  for(const person of data.people)for(const invitation of person.invitations)seen.set(invitation.function.id,invitation.function);
  const card=buildCardProps({
    theme:(THEMES.some((theme)=>theme.id===data.invitation!.theme)?data.invitation.theme:"mallige") as ThemeId,accent:data.invitation.accent,overrides:{[language]:data.invitation.texts},language,
    couple:data.couple_names.length?data.couple_names.join(" & "):"Our family",greetingName:data.household.name,
    functions:[...seen.values()].map((fn)=>({name:fn.name,function_date:fn.date,start_time:fn.start_time,venue_name:fn.location})),
  });
  return <section className="guest-portal-invitation" aria-label="Your invitation"><InvitationCard {...card}/></section>;
}

function TravelArrangements({person}:{person:PortalGuest}) {
  const stays=person.stays??[]; const journeys=person.journeys??[];
  if(!stays.length&&!journeys.length)return null;
  return <div className="guest-portal-function">
    <h3 className="guest-portal-function-heading">Your confirmed travel arrangements</h3>
    {stays.map((stay,index)=><div key={`stay-${index}`} className="guest-portal-meta">
      <p><strong>{stay.property}</strong>{stay.room_type?` · ${stay.room_type}`:""}</p>
      <p>Check in {formatDate(stay.check_in_date)}{stay.check_in_time?` from ${formatTime(stay.check_in_time)}`:""} · check out {formatDate(stay.check_out_date)}{stay.check_out_time?` by ${formatTime(stay.check_out_time)}`:""}</p>
      {stay.address&&<p><MapPin size={15} aria-hidden="true"/> {stay.address}</p>}
      {stay.notes&&<p>{stay.notes}</p>}
    </div>)}
    {journeys.map((journey,index)=><div key={`journey-${index}`} className="guest-portal-meta">
      <p><strong>{journey.kind==="arrival"?"Arrival transfer":journey.kind==="departure"?"Departure transfer":"Transfer"}</strong> · {new Intl.DateTimeFormat("en-IE",{weekday:"long",day:"numeric",month:"long",hour:"numeric",minute:"2-digit",timeZone:journey.timezone}).format(new Date(journey.pickup_at))}</p>
      <p>From {journey.pickup_location} to {journey.dropoff_location}</p>
    </div>)}
    <p className="guest-portal-help">If anything here looks wrong, please contact your hosts.</p>
  </div>;
}

export function GuestPortal({data}:{data:GuestPortalData|null}) {
  if(!data)return <TokenExchange/>;
  return <PortalFrame>
    <PortalInvitationCard data={data}/>
    <PortalItinerary data={data}/>
    <header className="guest-portal-welcome"><p className="guest-portal-eyebrow">A celebration with</p><h1>{data.couple_names.length?data.couple_names.join(" & "):"Our family"}</h1><p>Welcome, {data.household.name}. Please respond separately for each invited person and function.</p></header>
    {data.people.length>0&&data.people.reduce((total,person)=>total+person.invitations.length,0)>1&&<HouseholdAcceptAll count={data.people.length}/>}
    {!data.people.length?<section className="guest-portal-state"><h2>Invitation details are not available</h2><p>{unavailableCopy}</p></section>:data.people.map(person=><section className="guest-portal-person" key={person.id}>
      <div className="guest-portal-person-heading"><h2>{person.full_name}</h2><span>{person.invitations.length} {person.invitations.length===1?"invitation":"invitations"}</span></div>
      <PersonRsvpForm key={`${person.id}:${person.invitations.map((invitation)=>`${invitation.id}:${invitation.updated_at??"new"}`).join("|")}`} person={person}/>
      <TravelArrangements person={person}/>
      <GuestProfileForm person={person}/>
    </section>)}
    <aside className="guest-portal-help"><p>Need to update who is invited or have a question? Please contact your hosts.</p></aside>
  </PortalFrame>;
}
