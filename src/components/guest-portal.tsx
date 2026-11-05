"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Heart, MapPin } from "lucide-react";
import { recordGuestPortalRsvpBatchAction, saveGuestPortalProfileAction, type GuestActionState } from "@/app/actions/guests";
import type { GuestPortalData, PortalGuest, PortalInvitation } from "@/lib/guest-portal/server";
import { Button } from "@/components/ui";

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

function RsvpFields({invitation,draft,onChange}:{invitation:PortalInvitation;draft:PortalRsvpDraft;onChange:(next:PortalRsvpDraft)=>void}){
  return <div className="guest-portal-form">
    <label className="guest-portal-label" htmlFor={`rsvp-${invitation.id}`}>Your response for {invitation.function.name}</label>
    <select id={`rsvp-${invitation.id}`} className="guest-portal-input" value={draft.response} required onChange={(event)=>onChange({...draft,response:event.currentTarget.value as PortalRsvpDraft["response"]})}>
      <option value="" disabled>Choose a response</option><option value="yes">Accept invitation</option><option value="no">Decline invitation</option><option value="maybe">Not sure yet</option>
    </select>
    <label className="guest-portal-label" htmlFor={`rsvp-note-${invitation.id}`}>Note for your hosts (optional)</label>
    <textarea id={`rsvp-note-${invitation.id}`} className="guest-portal-input" rows={2} maxLength={2000} value={draft.note} onChange={(event)=>onChange({...draft,note:event.currentTarget.value})}/>
  </div>;
}

function PersonRsvpForm({person}:{person:PortalGuest}){
  const [state,action,pending]=useActionState(recordGuestPortalRsvpBatchAction,initial);
  const [drafts,setDrafts]=useState<Record<string,PortalRsvpDraft>>(()=>Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,{response:invitation.response??"",note:invitation.response_note??""}])));
  const [submissionKeys,setSubmissionKeys]=useState<Record<string,string>>({});
  const [batchSubmissionKey,setBatchSubmissionKey]=useState("");
  const router=useRouter();
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
  return <form action={action} className="guest-portal-rsvp-batch">
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

export function GuestPortal({data}:{data:GuestPortalData|null}) {
  if(!data)return <TokenExchange/>;
  return <PortalFrame>
    <header className="guest-portal-welcome"><p className="guest-portal-eyebrow">A celebration with</p><h1>{data.couple_names.length?data.couple_names.join(" & "):"Our family"}</h1><p>Welcome, {data.household.name}. Please respond separately for each invited person and function.</p></header>
    {!data.people.length?<section className="guest-portal-state"><h2>Invitation details are not available</h2><p>{unavailableCopy}</p></section>:data.people.map(person=><section className="guest-portal-person" key={person.id}>
      <div className="guest-portal-person-heading"><h2>{person.full_name}</h2><span>{person.invitations.length} {person.invitations.length===1?"invitation":"invitations"}</span></div>
      <PersonRsvpForm key={`${person.id}:${person.invitations.map((invitation)=>`${invitation.id}:${invitation.updated_at??"new"}`).join("|")}`} person={person}/>
      <GuestProfileForm person={person}/>
    </section>)}
    <aside className="guest-portal-help"><p>Need to update who is invited or have a question? Please contact your hosts.</p></aside>
  </PortalFrame>;
}
