"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState } from "react";
import { PORTAL_LOCALES, PORTAL_STRINGS, translateResult, type PortalStrings } from "@/lib/guest-portal/i18n";
import { buildItinerary, functionIcs, mapLink } from "@/lib/guest-portal/itinerary";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarPlus, Heart, MapPin } from "lucide-react";
import { recordGuestPortalRsvpBatchAction, saveGuestPortalProfileAction, type GuestActionState } from "@/app/actions/guests";
import type { GuestPortalData, PortalGuest, PortalInvitation } from "@/lib/guest-portal/server";
import { Button } from "@/components/ui";
import { InvitationCard } from "@/components/invitation-card";
import { BlessingHeader, BlessingsSection, CelebrationBurst, ClosingSection, CountdownBanner, FamilyLines, FaqSection, GallerySection, InfoSection, KacheriVeena, MantapaThoranam, MusicButton, OpeningOverlay, Palette, SectionNav, StorySection } from "@/components/portal-site";
import { nextFunctionStart, readSite, type CelebrationEffect, type InvitationSite } from "@/lib/invitations/site";
import { resolveFunctionSchedule } from "@/lib/planning/schedule";
import { buildCardProps, monogramFor, saveTheDateOf } from "@/lib/invitations/card-data";
import { isLanguage, LANGUAGES, pageAccentText, readableAccent, THEMES, type LanguageCode, type ThemeId } from "@/lib/invitations/content";

const initial: GuestActionState = {};
const LANGUAGE_KEY = "wedding-desk:portal-language";
const PortalLanguage = createContext<{ lang: LanguageCode; t: PortalStrings; setLang: (lang: LanguageCode) => void }>({ lang: "en", t: PORTAL_STRINGS.en, setLang: () => {} });
const useT = () => useContext(PortalLanguage).t;
/** The couple's chosen celebration effect, for the burst after a "yes". */
const PortalEffect = createContext<CelebrationEffect>("petals");
const useLocale = () => PORTAL_LOCALES[useContext(PortalLanguage).lang];

/** The household's language by default; a guest's own choice is remembered on their device. */
function LanguageProvider({ initialLang, controlled, children }: { initialLang: LanguageCode; controlled?: { lang: LanguageCode; setLang: (lang: LanguageCode) => void }; children: React.ReactNode }) {
  const [own, setOwn] = useState<LanguageCode>(initialLang);
  useEffect(() => { if (controlled) return; try { const saved = window.localStorage.getItem(LANGUAGE_KEY); if (saved && isLanguage(saved)) setOwn(saved); } catch { /* preference only */ } }, [controlled]);
  const setLang = controlled?.setLang ?? ((next: LanguageCode) => { setOwn(next); try { window.localStorage.setItem(LANGUAGE_KEY, next); } catch { /* preference only */ } });
  const lang = controlled?.lang ?? own;
  return <PortalLanguage.Provider value={{ lang, t: PORTAL_STRINGS[lang], setLang }}>{children}</PortalLanguage.Provider>;
}

function browserLanguage(): LanguageCode {
  if (typeof navigator === "undefined") return "en";
  const code = navigator.language.slice(0, 2);
  return code === "hi" ? "hi" : code === "kn" ? "kn" : "en";
}

function TokenExchange() {
  return <LanguageProvider initialLang={browserLanguage()}><TokenExchangeInner/></LanguageProvider>;
}
function TokenExchangeInner() {
  const t = useT();
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    // Remove the bearer token from the address bar/history before making a request.
    window.history.replaceState(null, "", "/guest");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setFailed(true); return; }
    void fetch("/api/guest-portal/exchange", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (!response.ok) { setFailed(true); return; }
      router.replace("/guest");
      router.refresh();
    }).catch(() => setFailed(true));
  }, [router]);
  return <PortalFrame><div className="guest-portal-state" role="status"><span className="guest-portal-heart"><Heart size={18}/></span><h1>{t.privateInvitation}</h1><p>{failed ? t.unavailable : t.checking}</p></div></PortalFrame>;
}

function PortalFrame({children,style,embedded=false,className=""}:{children:React.ReactNode;style?:React.CSSProperties;embedded?:boolean;className?:string}) {
  const { lang, t, setLang } = useContext(PortalLanguage);
  // Embedded in the studio's phone preview, the page must not add a second <main> landmark.
  const Frame = embedded ? "div" : "main";
  return <Frame className={`guest-portal-main ${className}`} lang={lang === "tcy" ? "tcy" : lang} style={style}>
    <div className="guest-portal-brand"><span className="guest-portal-heart"><Heart size={17}/></span><span>{t.brand}</span>
      <label className="portal-language"><span className="sr-only">{t.language}</span>
        <select value={lang} onChange={(event)=>setLang(event.target.value as LanguageCode)} aria-label={t.language}>{LANGUAGES.map((item)=><option key={item.code} value={item.code}>{item.label.split(" · ")[0]}</option>)}</select>
      </label>
    </div>
    {children}<p className="guest-portal-footer">{t.footer}</p></Frame>;
}

function useFormatters(){
  const locale=useLocale(); const t=useT();
  return {
    date:(value:string|null)=>{ if(!value)return t.dateTbc; const parsed=new Date(`${value}T12:00:00Z`); if(Number.isNaN(parsed.valueOf()))return value; return new Intl.DateTimeFormat(locale,{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(parsed); },
    time:(value:string|null)=>{ if(!value)return ""; const parsed=new Date(`2000-01-01T${value}Z`); if(Number.isNaN(parsed.valueOf()))return value; return new Intl.DateTimeFormat(locale,{hour:"numeric",minute:"2-digit",timeZone:"UTC"}).format(parsed); },
    instant:(value:string,timeZone:string,withDay=false)=>new Intl.DateTimeFormat(locale,withDay?{weekday:"long",day:"numeric",month:"long",hour:"numeric",minute:"2-digit",timeZone}:{hour:"numeric",minute:"2-digit",timeZone}).format(new Date(value)),
  };
}

type PortalRsvpDraft={response:""|"yes"|"no"|"maybe";note:string};

const RESPONSE_VALUES=["yes","no","maybe"] as const;
function RsvpFields({invitation,draft,onChange}:{invitation:PortalInvitation;draft:PortalRsvpDraft;onChange:(next:PortalRsvpDraft)=>void}){
  const t=useT();
  return <div className="guest-portal-form">
    <fieldset className="rsvp-choice">
      <legend className="guest-portal-label">{t.responseFor(invitation.function.name)}</legend>
      {RESPONSE_VALUES.map((value)=>({value,label:t[value]})).map((option)=><label key={option.value} className={`rsvp-option rsvp-${option.value} ${draft.response===option.value?"is-selected":""}`}>
        <input type="radio" name={`rsvp-${invitation.id}`} value={option.value} checked={draft.response===option.value} onChange={()=>onChange({...draft,response:option.value})}/>
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    <details className="rsvp-note" open={Boolean(draft.note)}>
      <summary>{t.addNote}</summary>
      <label className="sr-only" htmlFor={`rsvp-note-${invitation.id}`}>{t.noteLabel}</label>
      <textarea id={`rsvp-note-${invitation.id}`} className="guest-portal-input" rows={2} maxLength={2000} value={draft.note} onChange={(event)=>onChange({...draft,note:event.currentTarget.value})}/>
    </details>
  </div>;
}

function PersonRsvpForm({person}:{person:PortalGuest}){
  const t=useT();
  const [state,action,pending]=useActionState(recordGuestPortalRsvpBatchAction,initial);
  const shown=translateResult(t,state);
  const [drafts,setDrafts]=useState<Record<string,PortalRsvpDraft>>(()=>Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,{response:invitation.response??"",note:invitation.response_note??""}])));
  const [submissionKeys,setSubmissionKeys]=useState<Record<string,string>>({});
  const [batchSubmissionKey,setBatchSubmissionKey]=useState("");
  const router=useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const [submitAfterUpdate,setSubmitAfterUpdate]=useState(false);
  const acceptAll=()=>setDrafts((current)=>Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,{note:current[invitation.id]?.note??"",response:"yes"}])));
  // Accept all invitations this link is authorized to manage.
  useEffect(()=>{
    const onAll=()=>{acceptAll();setSubmitAfterUpdate(true);};
    window.addEventListener("portal:accept-all",onAll);
    return ()=>window.removeEventListener("portal:accept-all",onAll);
  });

  const saidYes=useRef(false);
  const [burst,setBurst]=useState(0);
  const effect=useContext(PortalEffect);
  useEffect(()=>{
    setSubmissionKeys(Object.fromEntries(person.invitations.map((invitation)=>[invitation.id,crypto.randomUUID()])));
    setBatchSubmissionKey(crypto.randomUUID());
  },[person.id]);
  useEffect(()=>{
    if(state.message&&state.savedId===batchSubmissionKey){
      if(saidYes.current){saidYes.current=false;setBurst((count)=>count+1);}
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
  return <form ref={formRef} action={action} className="guest-portal-rsvp-batch" onSubmit={()=>{saidYes.current=changed.some((invitation)=>drafts[invitation.id]?.response==="yes");}}>
    {burst>0&&<CelebrationBurst key={burst} kind={effect}/>}
    {person.invitations.length>1&&<button type="button" className="rsvp-all" onClick={acceptAll}>{t.yesToAll(person.full_name)}</button>}
    <div className="guest-portal-functions">{person.invitations.map((invitation)=><FunctionCard key={invitation.id} invitation={invitation}><RsvpFields invitation={invitation} draft={drafts[invitation.id]??{response:"",note:""}} onChange={(next)=>setDrafts((current)=>({...current,[invitation.id]:next}))}/></FunctionCard>)}</div>
    <input type="hidden" name="responsesJson" value={responses}/>
    {shown.error&&<p className="guest-portal-error" role="alert">{shown.error}</p>}{shown.message&&<p className="guest-portal-success" role="status">{shown.message}</p>}
    <Button type="submit" disabled={pending||!batchSubmissionKey||!changed.length}>{pending?t.saving:t.saveAll}</Button>
  </form>;
}

function GuestProfileForm({person}:{person:PortalGuest}) {
  const t=useT();
  const [state,action,pending]=useActionState(saveGuestPortalProfileAction,initial);
  const shown=translateResult(t,state);
  const [submissionKey,setSubmissionKey]=useState("");
  const router=useRouter();
  useEffect(()=>setSubmissionKey(crypto.randomUUID()),[]);
  useEffect(()=>{if(state.message&&state.savedId===submissionKey){setSubmissionKey(crypto.randomUUID());router.refresh();}},[state.message,state.savedId,submissionKey,router]);
  return <details className="guest-portal-dietary"><summary>{t.dietaryTitle}</summary><p>{t.dietaryIntro}</p>
    <form key={person.updated_at} action={action} className="guest-portal-form">
      <input type="hidden" name="guestId" value={person.id}/><input type="hidden" name="expectedUpdatedAt" value={person.updated_at}/><input type="hidden" name="submissionKey" value={submissionKey}/>
      <label className="guest-portal-label" htmlFor={`meal-${person.id}`}>{t.meal}</label><textarea id={`meal-${person.id}`} className="guest-portal-input" name="mealPreference" rows={2} maxLength={500} defaultValue={person.meal_preference}/>
      <label className="guest-portal-label" htmlFor={`allergies-${person.id}`}>{t.allergies}</label><textarea id={`allergies-${person.id}`} className="guest-portal-input" name="allergies" rows={2} maxLength={2000} defaultValue={person.allergies}/>
      <label className="guest-portal-label" htmlFor={`assistance-${person.id}`}>{t.assistance}</label><textarea id={`assistance-${person.id}`} className="guest-portal-input" name="assistanceNeeds" rows={2} maxLength={2000} defaultValue={person.assistance_needs}/>
      {shown.error&&<p className="guest-portal-error" role="alert">{shown.error}</p>}{shown.message&&<p className="guest-portal-success" role="status">{shown.message}</p>}
      <Button type="submit" variant="secondary" disabled={pending||!submissionKey}>{pending?t.savingInfo:t.saveInfo}</Button>
    </form>
  </details>;
}

function FunctionCard({invitation,children}:{invitation:PortalInvitation;children:React.ReactNode}) {
  const t=useT(); const format=useFormatters();
  const fn=invitation.function;
  const start=fn.start_time?format.time(fn.start_time):"";
  const end=fn.end_time?format.time(fn.end_time):"";
  return <article className="guest-portal-function">
    <div className="guest-portal-function-heading"><div><p className="guest-portal-eyebrow">{fn.type}</p><h3>{fn.name}</h3></div><span className={`guest-portal-status ${fn.status}`}>{fn.status==="confirmed"?t.confirmed:t.tentative}</span></div>
    <p className="guest-portal-date">{format.date(fn.date)} <span>· {fn.timezone}</span></p>
    {(start||end)&&<p className="guest-portal-meta">{start||t.timeTbc}{end?` – ${end}${start&&fn.end_time!.slice(0,8)<fn.start_time!.slice(0,8)?` (${t.endsNextDay})`:""}`:""}</p>}
    {fn.location&&<p className="guest-portal-meta"><MapPin size={15} aria-hidden="true"/> {fn.location}</p>}
    {fn.dress_code&&<p className="guest-portal-meta"><strong>{t.dressCode}:</strong> {fn.dress_code}</p>}
    {fn.map_url&&<a className="guest-portal-map" href={fn.map_url} target="_blank" rel="noopener noreferrer">{t.openMap} <ArrowUpRight size={14}/></a>}
    {children}
  </article>;
}

function AuthorizedGuestsAcceptAll({count}:{count:number}){
  const t=useT();
  const [confirming,setConfirming]=useState(false);
  return <section className="guest-portal-person household-accept">
    <h2>{t.replyEveryoneTitle}</h2>
    {!confirming?<button type="button" className="rsvp-all" onClick={()=>setConfirming(true)}>{t.replyEveryoneButton}</button>:<>
      <p>{t.replyEveryoneConfirm(count)}</p>
      <div className="guest-portal-link-actions"><Button type="button" onClick={()=>{window.dispatchEvent(new Event("portal:accept-all"));setConfirming(false);}}>{t.saveForEveryone}</Button><Button type="button" variant="secondary" onClick={()=>setConfirming(false)}>{t.cancel}</Button></div>
    </>}
  </section>;
}

function downloadIcs(fn:Parameters<typeof functionIcs>[0]){
  const ics=functionIcs(fn);if(!ics)return;
  const url=URL.createObjectURL(new Blob([ics],{type:"text/calendar;charset=utf-8"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=`${fn.name.replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"")||"event"}.ics`;anchor.click();URL.revokeObjectURL(url);
}

function PortalItinerary({data,site}:{data:GuestPortalData;site:InvitationSite}){
  const t=useT(); const format=useFormatters();
  const entries=buildItinerary(data.people);
  if(!entries.length)return null;
  const everyone=data.people.length;
  const who=(people:string[])=>people.length===everyone&&everyone>1?t.everyone:people.join(", ");
  return <section id="plan" className="guest-portal-person itinerary" aria-labelledby="itinerary-title">
    <div className="guest-portal-person-heading"><h2 id="itinerary-title">{t.yourPlan}</h2><span>{t.items(entries.length)}</span></div>
    <ol className="itinerary-list">{entries.map((entry)=><li key={entry.key} className={`itinerary-item itinerary-${entry.type}`}>
      <p className="itinerary-date">{format.date(entry.date)}</p>
      {entry.type==="function"&&<>
        <p className="itinerary-title">{entry.fn.name}{entry.fn.start_time?` · ${format.time(entry.fn.start_time)}`:""}{entry.fn.status==="tentative"?` · ${t.timingTbc}`:""}</p>
        <p className="guest-portal-meta">{[entry.fn.location,entry.fn.dress_code&&`${t.dressCode}: ${entry.fn.dress_code}`].filter(Boolean).join(" · ")}</p>
        <p className="guest-portal-meta">{who(entry.people)}</p>
        <Palette t={t} colors={site.palettes[entry.fn.id]} />
        <div className="guest-portal-link-actions">
          {entry.fn.date&&<button type="button" className="itinerary-action" onClick={()=>downloadIcs(entry.fn)}><CalendarPlus size={15} aria-hidden="true"/> {t.addToCalendar}</button>}
          {mapLink(entry.fn)&&<a className="itinerary-action" href={mapLink(entry.fn)!} target="_blank" rel="noopener noreferrer"><MapPin size={15} aria-hidden="true"/> {t.map}</a>}
        </div>
      </>}
      {entry.type==="stay"&&<><p className="itinerary-title">{t.stayAt(entry.stay.property)}</p><p className="guest-portal-meta">{t.until(format.date(entry.stay.check_out_date))} · {who(entry.people)}</p></>}
      {entry.type==="ride"&&<><p className="itinerary-title">{entry.ride.kind==="arrival"?t.pickup:entry.ride.kind==="departure"?t.departureRide:t.ride} · {format.instant(entry.ride.pickup_at,entry.ride.timezone)}</p><p className="guest-portal-meta">{entry.ride.pickup_location} → {entry.ride.dropoff_location} · {who(entry.people)}</p></>}
    </li>)}</ol>
  </section>;
}

function PortalInvitationCard({data}:{data:GuestPortalData}){
  const { lang } = useContext(PortalLanguage);
  if(!data.invitation)return null;
  const portalGuest=data.people.find((person)=>person.id===data.portal_guest_id);
  const householdLanguage=isLanguage(data.household.language??"en")?data.household.language as LanguageCode:"en";
  // The couple's custom wording exists only for the household's language; other languages use the built-in text.
  const language=lang;
  const seen=new Map<string,PortalInvitation["function"]>();
  for(const person of data.people)for(const invitation of person.invitations)seen.set(invitation.function.id,invitation.function);
  const card=buildCardProps({
    theme:(THEMES.some((theme)=>theme.id===data.invitation!.theme)?data.invitation.theme:"mallige") as ThemeId,accent:data.invitation.accent,overrides:data.invitation.all_texts??(language===householdLanguage?{[language]:data.invitation.texts}:{}),language,
    couple:data.couple_names.length?data.couple_names.join(" & "):"Our family",greetingName:portalGuest?.full_name??data.household.name,
    functions:[...seen.values()].map((fn)=>({name:fn.name,function_date:fn.date,start_time:fn.start_time,venue_name:fn.location})),
    photoUrl:data.invitation.photo_url!==undefined?data.invitation.photo_url:data.invitation.has_photo?"/guest/photo":null,showMonogram:data.invitation.show_monogram!==false,
    saveTheDate:saveTheDateOf(readSite(data.site)),
  });
  return <div className="guest-portal-invitation"><InvitationCard {...card}/></div>;
}

function TravelArrangements({person}:{person:PortalGuest}) {
  const t=useT(); const format=useFormatters();
  const stays=person.stays??[]; const journeys=person.journeys??[];
  if(!stays.length&&!journeys.length)return null;
  return <div className="guest-portal-function">
    <h3 className="guest-portal-function-heading">{t.travelTitle}</h3>
    {stays.map((stay,index)=><div key={`stay-${index}`} className="guest-portal-meta">
      <p><strong>{stay.property}</strong>{stay.room_type?` · ${stay.room_type}`:""}</p>
      <p>{t.checkIn(format.date(stay.check_in_date),format.time(stay.check_in_time))} · {t.checkOut(format.date(stay.check_out_date),format.time(stay.check_out_time))}</p>
      {stay.address&&<p><MapPin size={15} aria-hidden="true"/> {stay.address}</p>}
      {stay.notes&&<p>{stay.notes}</p>}
    </div>)}
    {journeys.map((journey,index)=><div key={`journey-${index}`} className="guest-portal-meta">
      <p><strong>{journey.kind==="arrival"?t.arrivalTransfer:journey.kind==="departure"?t.departureTransfer:t.transfer}</strong> · {format.instant(journey.pickup_at,journey.timezone,true)}</p>
      <p>{t.fromTo(journey.pickup_location,journey.dropoff_location)}</p>
    </div>)}
    <p className="guest-portal-help">{t.travelHelp}</p>
  </div>;
}

export function GuestPortal({data}:{data:GuestPortalData|null}) {
  if(!data)return <TokenExchange/>;
  const initialLang=isLanguage(data.household.language??"en")?data.household.language as LanguageCode:"en";
  return <LanguageProvider initialLang={initialLang}><PortalContent data={data}/></LanguageProvider>;
}

/** The guest page with sample or draft content, for the studio's phone preview and family preview links. */
export function PortalPreview({data,lang,setLang,replay=0,embedded=false}:{data:GuestPortalData;lang?:LanguageCode;setLang?:(lang:LanguageCode)=>void;replay?:number;embedded?:boolean}) {
  const initialLang=isLanguage(data.household.language??"en")?data.household.language as LanguageCode:"en";
  return <LanguageProvider initialLang={initialLang} controlled={lang&&setLang?{lang,setLang}:undefined}><PortalContent data={data} replay={replay} embedded={embedded}/></LanguageProvider>;
}

function PreviewReplies({data}:{data:GuestPortalData}){
  const t=useT();
  const person=data.people[0];
  return <section className="guest-portal-person">
    <div className="guest-portal-person-heading"><h2>{person?.full_name??t.previewGuest}</h2><span>{t.invitations(person?.invitations.length??0)}</span></div>
    <p className="portal-preview-note">{t.previewRsvpOff}</p>
    {person&&<div className="guest-portal-functions">{person.invitations.map((invitation)=><FunctionCard key={invitation.id} invitation={invitation}><div className="rsvp-choice is-disabled" aria-hidden="true">{RESPONSE_VALUES.map((value)=><span key={value} className={`rsvp-option rsvp-${value}`}>{t[value]}</span>)}</div></FunctionCard>)}</div>}
  </section>;
}

/** Save the Date: the day itself, a calendar entry for it, and a note that the invitation will follow. */
function SaveTheDateNote({date,couple,timezone}:{date:string;couple:string;timezone:string}){
  const t=useT(); const format=useFormatters();
  return <section id="plan" className="guest-portal-person portal-std" aria-labelledby="std-title">
    <h2 id="std-title">{t.stdTitle}</h2>
    <p className="portal-std-date">{format.date(date)}</p>
    <p className="guest-portal-meta">{t.stdFollow}</p>
    <div className="guest-portal-link-actions"><button type="button" className="itinerary-action" onClick={()=>downloadIcs({id:`save-the-date-${date}`,name:couple,date,start_time:null,end_time:null,timezone,location:null,map_url:null,dress_code:null,status:"confirmed"})}><CalendarPlus size={15} aria-hidden="true"/> {t.addToCalendar}</button></div>
  </section>;
}

function PortalContent({data,replay=0,embedded=false}:{data:GuestPortalData;replay?:number;embedded?:boolean}) {
  const t=useT(); const locale=useLocale();
  const preview=data.preview;
  const [opened,setOpened]=useState(0);
  const portalGuest=data.people.find((person)=>person.id===data.portal_guest_id);
  const proxyPeople=data.people.filter((person)=>person.is_proxy);
  const site=readSite(data.site);
  const couple=data.couple_names.length?data.couple_names.join(" & "):t.ourFamily;
  // Function start instants (wedding timezone) for the countdown and the "happening now" banner.
  const seen=new Map<string,{name:string;startsAt:string|null}>();
  for(const person of data.people)for(const invitation of person.invitations){
    const fn=invitation.function;
    let startsAt:string|null=null;
    try{ startsAt=fn.date&&fn.start_time?resolveFunctionSchedule({date:fn.date,startTime:fn.start_time.slice(0,5),endTime:"",timezone:fn.timezone}).startsAt:null; }catch{ startsAt=null; }
    seen.set(fn.id,{name:fn.name,startsAt});
  }
  const functionStarts=[...seen.values()];
  // Save the Date: count down to the wedding day (midnight where the wedding is) instead of a function.
  const std=site.kind==="save_the_date"&&site.save_the_date.date?site.save_the_date:null;
  const weddingZone=data.people.flatMap((person)=>person.invitations)[0]?.function.timezone??"Asia/Kolkata";
  let stdStart:string|null=null;
  if(std){ try{ stdStart=resolveFunctionSchedule({date:std.date,startTime:"00:00",endTime:"",timezone:weddingZone}).startsAt; }catch{ stdStart=null; } }
  const now=new Date();
  const target=std?(stdStart&&new Date(stdStart)>now?{name:t.theWedding,startsAt:new Date(stdStart)}:null):nextFunctionStart(functionStarts,now);
  const liveTarget=std?null:functionStarts.filter((fn)=>fn.startsAt).map((fn)=>({name:fn.name,startsAt:new Date(fn.startsAt!)})).sort((a,b)=>Math.abs(a.startsAt.getTime()-now.getTime())-Math.abs(b.startsAt.getTime()-now.getTime()))[0]??null;
  const sections=[
    data.invitation?{id:"invitation",label:t.navInvitation}:null,
    site.story.length?{id:"story",label:site.titles.story||t.navStory}:null,
    data.media?.gallery.length?{id:"gallery",label:t.navGallery}:null,
    std?null:{id:"plan",label:t.navPlan},
    !std&&site.info_cards.length?{id:"info",label:site.titles.info||t.navInfo}:null,
    std?null:{id:"reply",label:t.navReply},
    !std&&site.faqs.length?{id:"faq",label:site.titles.faq||t.navFaq}:null,
    !std&&site.blessings_enabled?{id:"blessings",label:site.titles.blessings||t.navBlessings}:null,
  ].filter((item):item is {id:string;label:string}=>Boolean(item));
  const theme=THEMES.find((item)=>item.id===data.invitation?.theme);
  const themeStyle=theme?{["--portal-accent" as string]:data.invitation?.accent||theme.accent,["--portal-accent-text" as string]:pageAccentText(theme.id,data.invitation?.accent??null),["--portal-accent-on-theme" as string]:readableAccent(theme.id,data.invitation?.accent??null),["--portal-theme-bg" as string]:theme.background,["--portal-theme-ink" as string]:theme.ink} as React.CSSProperties:undefined;
  const monogram=data.invitation?.show_monogram!==false&&data.couple_names.length?monogramFor(couple)??undefined:undefined;
  return <PortalEffect.Provider value={site.effect}><PortalFrame style={themeStyle} embedded={embedded} className={`portal-template-${site.template}`}>
    {opened>0&&<CelebrationBurst key={`open-${opened}`} kind={site.effect}/>}
    {data.media?.music&&<MusicButton t={t} src={`${data.media.base}${data.media.music}`}/>}
    {preview&&<p className="portal-preview-banner" role="status">{t.previewBanner}{preview.expires_at?` · ${t.previewUntil(new Intl.DateTimeFormat(locale,{hour:"numeric",minute:"2-digit"}).format(new Date(preview.expires_at)))}`:""}</p>}
    {/* In the studio the opening plays only on "Replay opening"; guests and family previews see it once per visit. */}
    {data.invitation&&!(embedded&&replay===0)&&<OpeningOverlay key={replay} t={t} couple={couple} enabled={site.opening_animation} site={site} monogram={monogram} always={embedded} onOpened={()=>setOpened((n)=>n+1)}/>}
    <SectionNav t={t} sections={sections}/>
    <section id="invitation" className="portal-hero" aria-label={t.navInvitation}>
      {site.template==="mantapa"&&<MantapaThoranam/>}
      {site.template==="kacheri"&&<KacheriVeena/>}
      <BlessingHeader site={site}/>
      <PortalInvitationCard data={data}/>
      <FamilyLines names={data.couple_names} site={site}/>
      <CountdownBanner t={t} target={target} liveTarget={liveTarget} site={site}/>
    </section>
    <StorySection t={t} site={site}/>
    <GallerySection t={t} media={data.media}/>
    {std?<SaveTheDateNote date={std.date} couple={couple} timezone={weddingZone}/>:<>
    <PortalItinerary data={data} site={site}/>
    <InfoSection t={t} site={site}/>
    {preview?<div id="reply" className="portal-reply"><PreviewReplies data={data}/></div>:<div id="reply" className="portal-reply">
    <header className="guest-portal-welcome"><p className="guest-portal-eyebrow">{t.celebrationWith}</p><h1>{data.couple_names.length?data.couple_names.join(" & "):t.ourFamily}</h1><p>{t.welcome(portalGuest?.full_name??"")} {proxyPeople.length?t.proxyNote(proxyPeople.map((person)=>person.full_name).join(", ")):t.onlyYours}</p></header>
    {data.people.length>1&&data.people.reduce((total,person)=>total+person.invitations.length,0)>1&&<AuthorizedGuestsAcceptAll count={data.people.length}/>}
    {!data.people.length?<section className="guest-portal-state"><h2>{t.notAvailableTitle}</h2><p>{t.unavailable}</p></section>:data.people.map(person=><section className="guest-portal-person" key={person.id}>
      <div className="guest-portal-person-heading"><h2>{person.full_name}</h2><span>{person.is_proxy?t.proxyAccess:t.yourInvitation} · {t.invitations(person.invitations.length)}</span></div>
      <PersonRsvpForm key={`${person.id}:${person.invitations.map((invitation)=>`${invitation.id}:${invitation.updated_at??"new"}`).join("|")}`} person={person}/>
      <TravelArrangements person={person}/>
      <GuestProfileForm person={person}/>
    </section>)}
    </div>}
    <FaqSection t={t} site={site}/>
    <BlessingsSection t={t} site={site} blessings={data.blessings??[]} pending={data.my_pending_blessings??0} preview={Boolean(preview)}/>
    </>}
    <ClosingSection t={t} site={site}/>
    <aside className="guest-portal-help"><p>{t.contactHosts}</p></aside>
  </PortalFrame></PortalEffect.Provider>;
}
