"use client";
import { useMemo, useState } from "react";
import { BedDouble, Bus, ClipboardList, Printer, UsersRound } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { TabList } from "@/components/tab-list";
import { useRememberedState, useShowMore } from "@/components/use-remembered";
import { allocateHouseholdAction } from "@/app/actions/bulk";
import { Term } from "@/components/term";
import { Checkbox, Select, TextArea, TextInput } from "@/components/form-fields";
import { Card, EmptyState, PageHeading, StageBadge } from "@/components/ui";
import { describeStatus, statusOptions } from "@/lib/planning/status-vocabulary";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { instantToLocalInput } from "@/lib/planning/local-time";
import {
  ALLOCATION_LABELS, JOURNEY_KIND_LABELS, NEED_LABELS, NEED_STATE_LABELS, PAYMENT_LABELS,
  defaultStayDates, pickupSuggestions, stayCapacityIssues, stayNights, travelGapCounts, vehicleConflicts, type PickupSuggestion,
  type AllocationStatus, type JourneyStatus, type NeedState,
} from "@/lib/planning/travel-rules";
import type { TravelWorkspace } from "@/lib/data/travel";
import {
  addPassengersAction, createJourneyAction, createPropertyAction, createRoomAction, createRoomTypeAction, createStayAction, createTravelGroupAction,
  createVehicleAction, removePassengerAction, saveTravelProfileAction, setInventoryAction, setStayStatusAction, updateJourneyAction,
} from "@/app/actions/travel";

export type TravelTab = "needs" | "accommodation" | "transport" | "summaries";
export type TravelFilter = "all" | "rooms-missing" | "arrivals-missing" | "departures-missing" | "room-unknown";
type Data = TravelWorkspace;

const TABS: Array<{ id: TravelTab; label: string; icon: typeof BedDouble }> = [
  { id: "needs", label: "Guest needs", icon: UsersRound },
  { id: "accommodation", label: "Rooms", icon: BedDouble },
  { id: "transport", label: "Rides", icon: Bus },
  { id: "summaries", label: "Hotel & driver summaries", icon: ClipboardList },
];
const FILTERS: Array<{ id: TravelFilter; label: string }> = [
  { id: "all", label: "All guests" },
  { id: "rooms-missing", label: "Room not assigned" },
  { id: "arrivals-missing", label: "Arrival not assigned" },
  { id: "departures-missing", label: "Departure not assigned" },
  { id: "room-unknown", label: "Room need unknown" },
];

const day = (value: string) => formatDate(`${value}T12:00:00Z`, "UTC");
const nightsLabel = (checkIn: string, checkOut: string) => { const count = stayNights(checkIn, checkOut).length; return `${count} night${count === 1 ? "" : "s"}`; };

function NeedBadge({ state }: { state: NeedState }) {
  const kind = state === "not_assigned" ? "overdue" : state === "allocated" ? "confirmed" : state === "unknown" ? "pending" : "neutral";
  return <span className={`status status-${kind}`}><span aria-hidden="true">{state === "allocated" ? "✓" : state === "not_assigned" ? "!" : "•"}</span>{NEED_STATE_LABELS[state]}</span>;
}
function AllocationBadge({ status }: { status: AllocationStatus }) { return <StageBadge kind="stay" status={status} />; }
function JourneyBadge({ status }: { status: JourneyStatus }) { return <StageBadge kind="journey" status={status} />; }

export function TravelManager({ data, initialTab, initialFilter, tabFromUrl = false }: { data: Data; initialTab: TravelTab; initialFilter: TravelFilter; tabFromUrl?: boolean }) {
  const [tab, setTab] = useRememberedState<TravelTab>("travel-tab", initialTab, ["needs", "accommodation", "transport", "summaries"], tabFromUrl);
  const [printing, setPrinting] = useState<"hotel" | "driver" | null>(null);
  const tz = data.wedding.timezone;
  const guestName = useMemo(() => new Map(data.guests.map((guest) => [guest.guest_id, guest.full_name])), [data.guests]);
  const counts = travelGapCounts(data.states);

  const selectTab = (next: TravelTab) => {
    setTab(next);
    const url = new URL(window.location.href); url.searchParams.set("tab", next); if (next !== "needs") url.searchParams.delete("filter");
    window.history.replaceState(null, "", url);
  };
  const print = (kind: "hotel" | "driver") => { setPrinting(kind); requestAnimationFrame(() => { window.print(); setPrinting(null); }); };

  return <div className="travel-page" data-print={printing ?? undefined}>
    <PageHeading eyebrow="Wedding week" title="Who's staying where & getting around"
      description="Rooms and rides for your guests. Planned arrangements stay separate from confirmed ones, and guests only see confirmed stays and rides you choose to share." />
    <div className="metric-inline travel-gaps" aria-label="Guests needing allocations">
      <a className="metric-chip" href="/travel?tab=needs&filter=rooms-missing"><strong>{counts.roomsNotAssigned}</strong> need a room · not assigned</a>
      <a className="metric-chip" href="/travel?tab=needs&filter=arrivals-missing"><strong>{counts.arrivalsNotAssigned}</strong> need arrival transport · not assigned</a>
      <a className="metric-chip" href="/travel?tab=needs&filter=departures-missing"><strong>{counts.departuresNotAssigned}</strong> need departure transport · not assigned</a>
      <a className="metric-chip" href="/travel?tab=needs&filter=room-unknown"><strong>{counts.roomNeedUnknown}</strong> room need unknown</a>
    </div>
    <TabList tabs={TABS} selected={tab} onSelect={selectTab} label="Stays and transport sections" idPrefix="travel" />
    {!data.canEdit && <p className="readonly-note" role="note">You have read-only access to logistics. Ask an owner for logistics edit access to change allocations.</p>}
    <section role="tabpanel" id={`travel-panel-${tab}`} aria-labelledby={`travel-tab-${tab}`} tabIndex={0} className="section-stack">
      {tab === "needs" && <NeedsPanel data={data} initialFilter={initialFilter} />}
      {tab === "accommodation" && <AccommodationPanel data={data} guestName={guestName} />}
      {tab === "transport" && <TransportPanel data={data} guestName={guestName} />}
      {tab === "summaries" && <SummariesPanel data={data} guestName={guestName} onPrint={print} />}
    </section>
    <p className="generated-note">Loaded {formatDateTime(data.loadedAt, tz)} ({tz}). Travel times and references are manually entered and not live-verified.</p>
  </div>;
}

function NeedsPanel({ data, initialFilter }: { data: Data; initialFilter: TravelFilter }) {
  const [filter, setFilter] = useState<TravelFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const tz = data.wedding.timezone;
  const profiles = new Map(data.profiles.map((profile) => [profile.guest_id, profile]));
  const states = new Map(data.states.map((state) => [state.guestId, state]));
  const members = new Map(data.members.map((member) => [member.userId, member.name]));
  const rows = data.guests.filter((guest) => {
    const state = states.get(guest.guest_id)!;
    if (query && !`${guest.full_name} ${guest.household_name}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "rooms-missing") return state.accommodation === "not_assigned";
    if (filter === "arrivals-missing") return state.arrival === "not_assigned";
    if (filter === "departures-missing") return state.departure === "not_assigned";
    if (filter === "room-unknown") return state.accommodation === "unknown";
    return true;
  });
  const paged = useShowMore(rows);
  if (!data.guests.length) return <Card><EmptyState title="No guests yet" description="Add people on the Guests page first. Stays and journeys are always linked to existing guest records." /></Card>;
  return <Card title="Guest travel needs" subtitle="Who needs a room or a ride, and whether it is arranged.">
    <p className="field-help"><Term term="notAssigned">Not assigned</Term> · <Term term="unknown">Unknown</Term></p>
    <div className="table-toolbar">
      <div className="filter-group" role="group" aria-label="Filter guests">
        {FILTERS.map((option) => <button key={option.id} type="button" className={`chip ${filter === option.id ? "is-active" : ""}`} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>)}
      </div>
      <TextInput label="Search guests" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or household" />
    </div>
    <p className="field-help" role="status">{rows.length} of {data.guests.length} guests shown.</p>
    {!rows.length ? <EmptyState title="No guests match" description="Nobody matches this filter. That is good news for the “not assigned” filters." /> :
      <><div className="travel-guest-list">{paged.visible.map((guest) => {
        const state = states.get(guest.guest_id)!;
        const profile = profiles.get(guest.guest_id);
        return <article key={guest.guest_id} className="travel-guest">
          <div className="travel-guest-head">
            <div><h3 className="row-title">{guest.full_name}</h3><p className="row-meta">{guest.household_name || "No household"}{guest.assistance_needs ? ` · Assistance: ${guest.assistance_needs}` : ""}</p></div>
            <dl className="travel-need-grid">
              <div><dt>Room</dt><dd><NeedBadge state={state.accommodation} /></dd></div>
              <div><dt>Arrival</dt><dd><NeedBadge state={state.arrival} /></dd></div>
              <div><dt>Departure</dt><dd><NeedBadge state={state.departure} /></dd></div>
            </dl>
          </div>
          {profile && (profile.arrival_at || profile.arrival_details || profile.departure_at || profile.departure_details) && <p className="manual-note">
            {profile.arrival_at && <>Arrives {formatDateTime(profile.arrival_at, tz)} </>}{profile.arrival_details && <>({profile.arrival_details}) </>}
            {profile.departure_at && <>· Departs {formatDateTime(profile.departure_at, tz)} </>}{profile.departure_details && <>({profile.departure_details}) </>}
            <span className="manual-badge">Manually entered{profile.details_entered_by_user_id ? ` by ${members.get(profile.details_entered_by_user_id) ?? "a member"}` : ""}{profile.details_entered_at ? ` on ${formatDate(profile.details_entered_at, tz)}` : ""} · not live-verified</span>
          </p>}
          {data.canEdit && <details className="travel-edit"><summary>Edit needs and travel details</summary>
            <ActionForm action={saveTravelProfileAction} submitLabel="Save travel needs" className="field-grid">
              <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="guestId" value={guest.guest_id} /><input type="hidden" name="version" value={profile?.version ?? ""} />
              {(["accommodation_need", "arrival_transport_need", "departure_transport_need"] as const).map((key) => <Select key={key} label={key === "accommodation_need" ? "Room needed?" : key === "arrival_transport_need" ? "Arrival transport needed?" : "Departure transport needed?"} name={key} defaultValue={profile?.[key] ?? "unknown"}>
                {Object.entries(NEED_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>)}
              <TextInput label={`Arrival time (${tz})`} name="arrival_at" type="datetime-local" defaultValue={instantToLocalInput(profile?.arrival_at, tz)} />
              <TextInput label="Arrival details" name="arrival_details" maxLength={500} defaultValue={profile?.arrival_details ?? ""} hint="For example a flight or train. Not checked against any live service." />
              <TextInput label={`Departure time (${tz})`} name="departure_at" type="datetime-local" defaultValue={instantToLocalInput(profile?.departure_at, tz)} />
              <TextInput label="Departure details" name="departure_details" maxLength={500} defaultValue={profile?.departure_details ?? ""} />
              <TextArea label="Travel notes" name="travel_notes" maxLength={2000} defaultValue={profile?.travel_notes ?? ""} className="field-full" hint="Do not record passport or other identity-document numbers here." />
            </ActionForm>
          </details>}
        </article>;
      })}</div>{paged.remaining > 0 && <button type="button" className="button button-secondary show-more" onClick={paged.showMore}>Show more ({paged.remaining} left)</button>}</>}
  </Card>;
}

function AccommodationPanel({ data, guestName }: { data: Data; guestName: Map<string, string> }) {
  const roomById = new Map(data.rooms.map((room) => [room.id, room]));
  const typeById = new Map(data.roomTypes.map((type) => [type.id, type]));
  const roomLabel = (roomId: string) => { const room = roomById.get(roomId); const type = room ? typeById.get(room.room_type_id) : null; return room ? `${type?.name ?? "Room"} · ${room.label}${room.number_confirmed ? "" : " (number not confirmed)"}` : "Unknown room"; };
  return <>
    {data.canEdit && <Card title="Add a property" subtitle="Hotels, guesthouses or family homes used for guest stays.">
      <ActionForm action={createPropertyAction} submitLabel="Add property" resetOnSuccess idempotent className="field-grid">
        <input type="hidden" name="weddingId" value={data.wedding.id} />
        <TextInput label="Property name" name="name" required maxLength={180} />
        <TextInput label="Address" name="address" maxLength={1200} />
        <TextInput label="Contact name" name="contact_name" maxLength={160} />
        <TextInput label="Contact phone" name="contact_phone" type="tel" maxLength={80} />
        <TextInput label="Contact email" name="contact_email" type="email" maxLength={320} />
        <TextInput label="Check-in time" name="check_in_time" type="time" />
        <TextInput label="Check-out time" name="check_out_time" type="time" />
        <TextArea label="Notes guests may see" name="guest_facing_notes" maxLength={2000} hint="Shown in the guest portal only with confirmed stays." />
        <TextArea label="Internal notes" name="internal_notes" maxLength={4000} />
      </ActionForm>
    </Card>}
    {!data.properties.length ? <Card><EmptyState title="No properties yet" description="Add a property, then its room types, the nights you hold, and rooms. Guests can then be allocated." /></Card> :
      data.properties.map((property) => {
        const types = data.roomTypes.filter((type) => type.property_id === property.id);
        const typeIds = new Set(types.map((type) => type.id));
        const stays = data.stays.filter((stay) => { const room = roomById.get(stay.room_id); return room && typeIds.has(room.room_type_id); });
        return <Card key={property.id} title={property.name} subtitle={[property.address, property.check_in_time && `Check-in ${property.check_in_time.slice(0, 5)}`, property.check_out_time && `check-out ${property.check_out_time.slice(0, 5)}`].filter(Boolean).join(" · ") || undefined}>
          {!types.length ? <EmptyState title="No room types" description="Add a room type with its occupancy limit and extra beds." /> :
            <div className="table-scroll"><table className="data-table"><caption className="sr-only">Room types at {property.name}</caption>
              <thead><tr><th scope="col">Room type</th><th scope="col">Occupancy</th><th scope="col">Rooms</th><th scope="col">Nights held (in use / held)</th></tr></thead>
              <tbody>{types.map((type) => {
                const nights = data.inventory.filter((row) => row.room_type_id === type.id);
                const rooms = data.rooms.filter((room) => room.room_type_id === type.id);
                return <tr key={type.id}>
                  <td><span className="table-primary">{type.name}</span>{type.notes && <span className="table-secondary">{type.notes}</span>}</td>
                  <td>{type.standard_occupancy} guest(s){type.max_extra_beds ? ` + ${type.max_extra_beds} extra bed(s)` : ""}</td>
                  <td>{rooms.length ? rooms.map((room) => room.label).join(", ") : "None yet"}</td>
                  <td>{nights.length ? <ul className="night-list">{nights.map((row) => {
                    const used = new Set(data.stays.filter((stay) => stay.status !== "cancelled" && stay.check_in_date <= row.night && stay.check_out_date > row.night && roomById.get(stay.room_id)?.room_type_id === type.id).map((stay) => stay.room_id)).size;
                    return <li key={row.night}>{day(row.night)}: {used} / {row.rooms_held} <span className="table-secondary">{row.hold_status === "confirmed" ? "confirmed block" : "proposed hold"}</span></li>;
                  })}</ul> : "No nights held"}</td>
                </tr>;
              })}</tbody></table></div>}
          {data.canEdit && <details className="travel-edit"><summary>Add room type, nights or rooms</summary>
            <div className="travel-subforms">
              <ActionForm action={createRoomTypeAction} submitLabel="Add room type" resetOnSuccess className="field-grid" ariaLabel={`Add room type to ${property.name}`}>
                <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="property_id" value={property.id} />
                <TextInput label="Room type" name="name" required maxLength={120} placeholder="Double" />
                <TextInput label="Occupancy limit" name="standard_occupancy" type="number" inputMode="numeric" min={1} max={20} required defaultValue={2} />
                <TextInput label="Extra beds allowed per room" name="max_extra_beds" type="number" inputMode="numeric" min={0} max={10} defaultValue={0} />
                <TextInput label="Rooms to create now" name="room_count" type="number" inputMode="numeric" min={0} max={100} defaultValue={0} hint="Placeholder labels until the hotel confirms room numbers." />
                <TextArea label="Notes" name="notes" maxLength={2000} />
              </ActionForm>
              {types.length > 0 && <ActionForm action={setInventoryAction} submitLabel="Save nights" className="field-grid" ariaLabel={`Set nights held at ${property.name}`}>
                <input type="hidden" name="weddingId" value={data.wedding.id} />
                <Select label="Room type" name="room_type_id" required>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
                <TextInput label="First night" name="from" type="date" required />
                <TextInput label="Check-out day" name="to" type="date" required hint="The check-out day itself is not a night." />
                <TextInput label="Rooms held per night" name="rooms_held" type="number" inputMode="numeric" min={0} max={500} required />
                <Select label="Hold status" name="hold_status" defaultValue="proposed"><option value="proposed">Proposed hold</option><option value="confirmed">Confirmed block</option></Select>
              </ActionForm>}
              {types.length > 0 && <ActionForm action={createRoomAction} submitLabel="Add room" resetOnSuccess className="field-grid" ariaLabel={`Add a room at ${property.name}`}>
                <input type="hidden" name="weddingId" value={data.wedding.id} />
                <Select label="Room type" name="room_type_id" required>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
                <TextInput label="Room label or number" name="label" required maxLength={60} />
                <Checkbox label="Room number confirmed by the property" name="number_confirmed" />
              </ActionForm>}
            </div>
          </details>}
          <h3 className="guest-subheading">Stays</h3>
          {!stays.length ? <p className="field-help">No guests allocated here yet.</p> :
            <div className="table-scroll"><table className="data-table"><caption className="sr-only">Stays at {property.name}</caption>
              <thead><tr><th scope="col">Guest</th><th scope="col">Room</th><th scope="col">Dates</th><th scope="col">Status</th><th scope="col">Payment</th><th scope="col">Requirements</th>{data.canEdit && <th scope="col">Change</th>}</tr></thead>
              <tbody>{stays.map((stay) => <tr key={stay.id} className={stay.status === "cancelled" ? "is-muted" : ""}>
                <td><span className="table-primary">{guestName.get(stay.guest_id) ?? "Guest"}</span>{stay.uses_extra_bed && <span className="table-secondary">Extra bed</span>}</td>
                <td>{roomLabel(stay.room_id)}</td>
                <td>{day(stay.check_in_date)} → {day(stay.check_out_date)}<span className="table-secondary">{nightsLabel(stay.check_in_date, stay.check_out_date)}</span></td>
                <td><AllocationBadge status={stay.status as AllocationStatus} /></td>
                <td>{PAYMENT_LABELS[stay.payment_responsibility as keyof typeof PAYMENT_LABELS]}</td>
                <td>{stay.special_requirements || "—"}</td>
                {data.canEdit && <td><ActionForm action={setStayStatusAction} submitLabel="Update" className="inline-action-form" ariaLabel={`Change stay status for ${guestName.get(stay.guest_id) ?? "guest"}`}>
                  <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="stayId" value={stay.id} /><input type="hidden" name="version" value={stay.version} />
                  <Select label="Status" name="status" defaultValue={stay.status}>{statusOptions("stay").map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</Select>
                </ActionForm></td>}
              </tr>)}</tbody></table></div>}
        </Card>;
      })}
    {data.canEdit && data.rooms.length > 0 && <AllocateStay data={data} roomLabel={roomLabel} />}
    {data.canEdit && data.rooms.length > 0 && data.households.length > 0 && <AllocateHousehold data={data} roomLabel={roomLabel} />}
  </>;
}

function AllocateStay({ data, roomLabel }: { data: Data; roomLabel: (roomId: string) => string }) {
  const stayDefaults = (guest: string) => {
    const profile = data.profiles.find((row) => row.guest_id === guest);
    return defaultStayDates({ functionDates: data.functions.map((fn) => (fn as { function_date?: string | null }).function_date ?? null), arrivalAt: profile?.arrival_at ?? null, departureAt: profile?.departure_at ?? null, timezone: data.wedding.timezone });
  };
  const initial = stayDefaults("");
  const [guestId, setGuestId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [extraBed, setExtraBed] = useState(false);
  const [status, setStatus] = useState<AllocationStatus>("proposed");
  const issues = useMemo(() => {
    if (!guestId || !roomId || !checkIn || !checkOut) return [];
    const room = data.rooms.find((row) => row.id === roomId); const type = room && data.roomTypes.find((row) => row.id === room.room_type_id);
    if (!room || !type) return [];
    try {
      return stayCapacityIssues({
        stay: { guest_id: guestId, room_id: roomId, check_in_date: checkIn, check_out_date: checkOut, status, uses_extra_bed: extraBed },
        room: { ...type, room_type_id: type.id },
        roomTypeOfRoom: new Map(data.rooms.map((row) => [row.id, row.room_type_id])),
        heldRoomsByNight: new Map(data.inventory.filter((row) => row.room_type_id === type.id).map((row) => [row.night, row.rooms_held])),
        existing: data.stays as never,
      });
    } catch (error) { return [error instanceof Error ? error.message : "Check the dates."]; }
  }, [data, guestId, roomId, checkIn, checkOut, extraBed, status]);
  return <Card title="Allocate a room" subtitle="The database rejects allocations outside held nights, above occupancy, or that double-book a guest. Warnings below preview those checks.">
    <ActionForm action={createStayAction} submitLabel="Allocate room" className="field-grid">
      <input type="hidden" name="weddingId" value={data.wedding.id} />
      <Select label="Guest" name="guest_id" required value={guestId} hint="Dates fill in from the guest's recorded arrival and departure when known." onChange={(event) => { setGuestId(event.target.value); const next = stayDefaults(event.target.value); setCheckIn(next.checkIn); setCheckOut(next.checkOut); }}><option value="">Choose a guest</option>{data.guests.map((guest) => <option key={guest.guest_id} value={guest.guest_id}>{guest.full_name}{guest.household_name ? ` (${guest.household_name})` : ""}</option>)}</Select>
      <Select label="Room" name="room_id" required value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Choose a room</option>{data.rooms.map((room) => <option key={room.id} value={room.id}>{data.properties.find((property) => property.id === data.roomTypes.find((type) => type.id === room.room_type_id)?.property_id)?.name} · {roomLabel(room.id)}</option>)}</Select>
      <TextInput label="Check-in" name="check_in_date" type="date" required value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
      <TextInput label="Check-out" name="check_out_date" type="date" required value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
      <Select label="Allocation" name="status" value={status} onChange={(event) => setStatus(event.target.value as AllocationStatus)}><option value="proposed">Planned (not yet confirmed with the hotel)</option><option value="confirmed">Confirmed</option></Select>
      <Select label="Who pays" name="payment_responsibility" defaultValue="unknown">{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Checkbox label="Uses an extra bed" name="uses_extra_bed" checked={extraBed} onChange={(event) => setExtraBed(event.target.checked)} />
      <TextArea label="Special requirements" name="special_requirements" maxLength={2000} hint="For example ground floor or a cot." />
      <TextArea label="Notes" name="notes" maxLength={2000} />
      {issues.length > 0 && <ul className="travel-warning field-full" aria-live="polite">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </ActionForm>
  </Card>;
}

type JourneyPrefill = Pick<PickupSuggestion, "kind" | "title" | "pickupLocal" | "dropoffLocal" | "location" | "guestIds">;
function AllocateHousehold({ data, roomLabel }: { data: Data; roomLabel: (roomId: string) => string }) {
  const span = defaultStayDates({ functionDates: data.functions.map((fn) => (fn as { function_date?: string | null }).function_date ?? null), arrivalAt: null, departureAt: null, timezone: data.wedding.timezone });
  return <Card title="Place a whole household" subtitle="Fills the rooms you tick in order, up to each room's occupancy. Each stay is still checked for held nights and clashes; anyone who cannot be placed is listed.">
    <ActionForm action={allocateHouseholdAction} submitLabel="Place household" className="field-grid">
      <input type="hidden" name="weddingId" value={data.wedding.id} />
      <Select label="Household" name="householdId" required defaultValue=""><option value="" disabled>Choose a household</option>{data.households.map((household) => <option key={household.id} value={household.id}>{household.name} ({household.guest_ids.length})</option>)}</Select>
      <TextInput label="Check-in" name="checkIn" type="date" required defaultValue={span.checkIn} />
      <TextInput label="Check-out" name="checkOut" type="date" required defaultValue={span.checkOut} />
      <Select label="Allocation" name="status" defaultValue="proposed"><option value="proposed">Planned (not yet confirmed with the hotel)</option><option value="confirmed">Confirmed</option></Select>
      <Select label="Who pays" name="payment" defaultValue="unknown">{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <fieldset className="check-list field-full"><legend className="field-label">Rooms, in the order to fill</legend>
        {data.rooms.map((room) => <label key={room.id} className="check-row"><input type="checkbox" name="roomIds" value={room.id} /> {data.properties.find((property) => property.id === data.roomTypes.find((type) => type.id === room.room_type_id)?.property_id)?.name} · {roomLabel(room.id)}</label>)}
      </fieldset>
    </ActionForm>
  </Card>;
}

function JourneyFields({ data, journey, prefill }: { data: Data; journey?: Data["journeys"][number]; prefill?: JourneyPrefill }) {
  const tz = data.wedding.timezone;
  return <>
    {prefill?.guestIds.map((guestId) => <input key={guestId} type="hidden" name="board_guest_ids" value={guestId} />)}
    <Select label="Journey type" name="kind" defaultValue={journey?.kind ?? prefill?.kind ?? "arrival"}>{Object.entries(JOURNEY_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
    <TextInput label="Title" name="title" required maxLength={180} defaultValue={journey?.title ?? prefill?.title} placeholder="Airport pickup – Friday morning" />
    <TextInput label="Pickup location" name="pickup_location" required maxLength={300} defaultValue={journey?.pickup_location ?? (prefill?.kind === "arrival" ? prefill.location : undefined)} />
    <TextInput label="Drop-off location" name="dropoff_location" required maxLength={300} defaultValue={journey?.dropoff_location} />
    <TextInput label={`Pickup (${tz})`} name="pickup_at" type="datetime-local" required defaultValue={journey ? instantToLocalInput(journey.pickup_at, tz) : prefill?.pickupLocal} />
    <TextInput label={`Estimated drop-off (${tz})`} name="estimated_dropoff_at" type="datetime-local" required defaultValue={journey ? instantToLocalInput(journey.estimated_dropoff_at, tz) : prefill?.dropoffLocal} />
    {prefill && <p className="field-help field-full">{prefill.guestIds.length} guest(s) from this suggestion will be boarded when you create the journey. Times are suggestions from manually entered travel details.</p>}
    <Select label="Vehicle" name="vehicle_id" defaultValue={journey?.vehicle_id ?? ""}><option value="">Not assigned yet</option>{data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label} · {vehicle.passenger_capacity} seats</option>)}</Select>
    <Select label="Coordinator" name="coordinator_user_id" defaultValue={journey?.coordinator_user_id ?? ""}><option value="">None</option>{data.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select>
    <Select label="Linked function" name="function_id" defaultValue={journey?.function_id ?? ""}><option value="">None</option>{data.functions.map((fn) => <option key={fn.id} value={fn.id}>{fn.name}</option>)}</Select>
    <Select label="Status" name="status" defaultValue={journey?.status ?? "planned"}>{statusOptions("journey").map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</Select>
    <TextInput label="Status note" name="status_note" maxLength={1000} defaultValue={journey?.status_note} placeholder="For example: flight delayed 40 minutes" />
    <Checkbox label="Share with guests in the portal" name="shared_with_guests" defaultChecked={journey?.shared_with_guests} hint="Only when the arrangement is confirmed. Driver phone numbers are never shown to guests." />
    <TextArea label="Notes" name="notes" maxLength={2000} defaultValue={journey?.notes} />
  </>;
}

function TransportPanel({ data, guestName }: { data: Data; guestName: Map<string, string> }) {
  const tz = data.wedding.timezone;
  const vehicleById = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const memberName = new Map(data.members.map((member) => [member.userId, member.name]));
  const conflicts = vehicleConflicts(data.journeys as never);
  const [prefill, setPrefill] = useState<PickupSuggestion | null>(null);
  const suggestions = useMemo(() => pickupSuggestions({ states: data.states, profiles: data.profiles, timezone: data.wedding.timezone }), [data]);
  const conflictIds = new Set(conflicts.flat());
  return <>
    <div className="section-grid">
      <Card title="Vehicles" subtitle="Capacity is passenger seats and is enforced per journey.">
        {!data.vehicles.length ? <EmptyState title="No vehicles yet" description="Add a car, minibus or coach before assigning journeys." /> :
          <ul className="reference-list">{data.vehicles.map((vehicle) => <li key={vehicle.id} className="reference-row"><span><span className="row-title">{vehicle.label}</span><span className="row-meta">{[vehicle.vehicle_type, `${vehicle.passenger_capacity} seats`, vehicle.driver_name && `Driver: ${vehicle.driver_name}`, vehicle.driver_phone].filter(Boolean).join(" · ")}</span></span></li>)}</ul>}
        {data.canEdit && <details className="travel-edit"><summary>Add vehicle</summary>
          <ActionForm action={createVehicleAction} submitLabel="Add vehicle" resetOnSuccess className="field-grid">
            <input type="hidden" name="weddingId" value={data.wedding.id} />
            <TextInput label="Vehicle name" name="label" required maxLength={120} placeholder="Minibus 1" />
            <TextInput label="Type" name="vehicle_type" maxLength={80} />
            <TextInput label="Passenger seats" name="passenger_capacity" type="number" inputMode="numeric" min={1} max={100} required />
            <TextInput label="Driver name" name="driver_name" maxLength={160} />
            <TextInput label="Driver phone" name="driver_phone" type="tel" maxLength={80} />
            <TextArea label="Notes" name="notes" maxLength={2000} />
          </ActionForm>
        </details>}
      </Card>
      <Card title="Travel groups" subtitle="Guests who travel together, for example on one flight.">
        {!data.groups.length ? <EmptyState title="No travel groups" description="Groups let you board several guests at once." /> :
          <ul className="reference-list">{data.groups.map((group) => <li key={group.id} className="reference-row"><span><span className="row-title">{group.name}</span><span className="row-meta">{group.guest_ids.map((guestId) => guestName.get(guestId)).join(", ") || "No members"}</span></span></li>)}</ul>}
        {data.canEdit && data.guests.length > 0 && <details className="travel-edit"><summary>Create travel group</summary>
          <ActionForm action={createTravelGroupAction} submitLabel="Create group" resetOnSuccess className="field-grid">
            <input type="hidden" name="weddingId" value={data.wedding.id} />
            <TextInput label="Group name" name="name" required maxLength={160} />
            <Select label="Members" name="guest_ids" multiple size={6} hint="Hold Ctrl or Cmd to choose several.">{data.guests.map((guest) => <option key={guest.guest_id} value={guest.guest_id}>{guest.full_name}</option>)}</Select>
            <TextArea label="Notes" name="notes" maxLength={2000} />
          </ActionForm>
        </details>}
      </Card>
    </div>
    {conflicts.length > 0 && <p className="travel-warning" role="alert">{conflicts.length} vehicle clash(es): the same vehicle is on overlapping journeys. Reassign one of the highlighted journeys.</p>}
    {data.canEdit && suggestions.length > 0 && <Card title="Suggested pickups" subtitle="Guests who need a ride and have recorded travel times, grouped by hour.">
      <ul className="reference-list">{suggestions.map((suggestion) => <li key={suggestion.key} className="reference-row">
        <span><span className="row-title">{suggestion.title}</span><span className="row-meta">{suggestion.guestIds.map((guestId) => guestName.get(guestId)).join(", ")}{suggestion.detail ? ` · ${suggestion.detail}` : ""}</span></span>
        <button type="button" className="button button-secondary" onClick={() => { setPrefill(suggestion); document.getElementById("plan-journey")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Plan this</button>
      </li>)}</ul>
    </Card>}
    {data.canEdit && <Card id="plan-journey" title="Plan a pickup or drop-off" subtitle={prefill ? "Filled in from a suggestion. Check the details and add a vehicle." : "Each journey is one pickup task with a coordinator and status."}>
      <ActionForm key={prefill?.key ?? "blank"} action={createJourneyAction} submitLabel="Create journey" resetOnSuccess idempotent className="field-grid">
        <input type="hidden" name="weddingId" value={data.wedding.id} />
        <JourneyFields data={data} prefill={prefill ?? undefined} />
      </ActionForm>
      {prefill && <button type="button" className="button button-quiet" onClick={() => setPrefill(null)}>Clear suggestion</button>}
    </Card>}
    {!data.journeys.length ? <Card><EmptyState title="No journeys yet" description="Plan arrival and departure runs, then board guests or whole travel groups." /></Card> :
      data.journeys.map((journey) => {
        const vehicle = journey.vehicle_id ? vehicleById.get(journey.vehicle_id) : null;
        const onboard = data.passengers.filter((row) => row.journey_id === journey.id);
        return <Card key={journey.id} className={conflictIds.has(journey.id) ? "has-conflict" : ""} title={`${JOURNEY_KIND_LABELS[journey.kind as keyof typeof JOURNEY_KIND_LABELS]}: ${journey.title}`}
          subtitle={`${formatDateTime(journey.pickup_at, tz)} → ${formatTime(journey.estimated_dropoff_at, tz)} · ${journey.pickup_location} → ${journey.dropoff_location}`}
          action={<JourneyBadge status={journey.status as JourneyStatus} />}>
          <p className="row-meta">{vehicle ? `${vehicle.label} · ${onboard.length}/${vehicle.passenger_capacity} seats used` : `No vehicle yet · ${onboard.length} passenger(s)`}{journey.coordinator_user_id ? ` · Coordinator: ${memberName.get(journey.coordinator_user_id) ?? "member"}` : ""}{journey.shared_with_guests ? " · Shared with guests" : ""}</p>
          {journey.status_note && <p className="travel-delay">{journey.status_note}</p>}
          {conflictIds.has(journey.id) && <p className="travel-warning">This vehicle overlaps another journey.</p>}
          {onboard.length > 0 && <ul className="passenger-list">{onboard.map((row) => <li key={row.guest_id}>{guestName.get(row.guest_id) ?? "Guest"}
            {data.canEdit && journey.status !== "completed" && <ActionForm action={removePassengerAction} submitLabel="Remove" variant="quiet" className="inline-action-form" ariaLabel={`Remove ${guestName.get(row.guest_id)}`}>
              <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="journeyId" value={journey.id} /><input type="hidden" name="guestId" value={row.guest_id} />
            </ActionForm>}</li>)}</ul>}
          {data.canEdit && <div className="travel-subforms">
            {!["cancelled", "completed"].includes(journey.status) && <BoardPassengers data={data} journeyId={journey.id} onboard={new Set(onboard.map((row) => row.guest_id))} />}
            <details className="travel-edit"><summary>Edit journey or update status</summary>
              <ActionForm action={updateJourneyAction} submitLabel="Save journey" className="field-grid">
                <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="journeyId" value={journey.id} /><input type="hidden" name="version" value={journey.version} />
                <JourneyFields data={data} journey={journey} />
              </ActionForm>
            </details>
          </div>}
        </Card>;
      })}
  </>;
}

function BoardPassengers({ data, journeyId, onboard }: { data: Data; journeyId: string; onboard: Set<string> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const available = data.guests.filter((guest) => !onboard.has(guest.guest_id));
  return <ActionForm action={addPassengersAction} submitLabel="Board passengers" className="field-grid" ariaLabel="Board passengers">
    <input type="hidden" name="weddingId" value={data.wedding.id} /><input type="hidden" name="journeyId" value={journeyId} />
    {data.groups.length > 0 && <Select label="Add a travel group" value="" onChange={(event) => { const group = data.groups.find((row) => row.id === event.target.value); if (group) setSelected((current) => [...new Set([...current, ...group.guest_ids.filter((guestId) => !onboard.has(guestId))])]); }}>
      <option value="">Choose a group</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.guest_ids.length})</option>)}
    </Select>}
    <Select label="Guests" name="guest_ids" multiple size={5} value={selected} onChange={(event) => setSelected([...event.target.selectedOptions].map((option) => option.value))} hint="Hold Ctrl or Cmd to choose several.">
      {available.map((guest) => <option key={guest.guest_id} value={guest.guest_id}>{guest.full_name}</option>)}
    </Select>
  </ActionForm>;
}

function SummariesPanel({ data, guestName, onPrint }: { data: Data; guestName: Map<string, string>; onPrint: (kind: "hotel" | "driver") => void }) {
  const [confirmedOnly, setConfirmedOnly] = useState(true);
  const tz = data.wedding.timezone;
  const guestById = new Map(data.guests.map((guest) => [guest.guest_id, guest]));
  const roomById = new Map(data.rooms.map((room) => [room.id, room]));
  const typeById = new Map(data.roomTypes.map((type) => [type.id, type]));
  const memberName = new Map(data.members.map((member) => [member.userId, member.name]));
  const stays = data.stays.filter((stay) => stay.status === "confirmed" || (!confirmedOnly && stay.status === "proposed"));
  return <>
    <Card title="Summary options">
      <Checkbox label="Confirmed stays only (recommended for sending to a property)" checked={confirmedOnly} onChange={(event) => setConfirmedOnly(event.target.checked)} />
      <p className="field-help">Guest phone numbers appear only for members with guest-list access. Assistance needs appear only for owners and guest editors. Generated {formatDateTime(data.loadedAt, tz)}.</p>
    </Card>
    <section className="print-section" data-section="hotel">
      <div className="section-heading-row"><h2 className="card-title">Hotel rooming lists</h2><button type="button" className="button button-secondary" onClick={() => onPrint("hotel")}><Printer size={15} aria-hidden="true" /> Print hotel summary</button></div>
      {!data.properties.length ? <EmptyState title="No properties" description="Hotel summaries appear once properties have stays." /> : data.properties.map((property) => {
        const rows = stays.filter((stay) => typeById.get(roomById.get(stay.room_id)?.room_type_id ?? "")?.property_id === property.id);
        return <Card key={property.id} title={property.name} subtitle={`${rows.length} stay(s) · generated ${formatDateTime(data.loadedAt, tz)}`}>
          {!rows.length ? <p className="field-help">No {confirmedOnly ? "confirmed " : ""}stays.</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">Rooming list for {property.name}</caption>
            <thead><tr><th scope="col">Guest</th><th scope="col">Room</th><th scope="col">Check-in</th><th scope="col">Check-out</th><th scope="col">Status</th><th scope="col">Requirements</th><th scope="col">Payment</th>{data.canSeeGuestContacts && <th scope="col">Phone</th>}</tr></thead>
            <tbody>{rows.map((stay) => { const guest = guestById.get(stay.guest_id); const room = roomById.get(stay.room_id); return <tr key={stay.id}>
              <td>{guest?.full_name ?? "Guest"}</td><td>{typeById.get(room?.room_type_id ?? "")?.name} · {room?.label}{stay.uses_extra_bed ? " + extra bed" : ""}</td>
              <td>{day(stay.check_in_date)}</td><td>{day(stay.check_out_date)}</td><td>{ALLOCATION_LABELS[stay.status as AllocationStatus]}</td>
              <td>{[stay.special_requirements, guest?.assistance_needs].filter(Boolean).join(" · ") || "—"}</td><td>{PAYMENT_LABELS[stay.payment_responsibility as keyof typeof PAYMENT_LABELS]}</td>
              {data.canSeeGuestContacts && <td>{guest?.phone || "—"}</td>}
            </tr>; })}</tbody></table></div>}
        </Card>;
      })}
    </section>
    <section className="print-section" data-section="driver">
      <div className="section-heading-row"><h2 className="card-title">Driver run sheets</h2><button type="button" className="button button-secondary" onClick={() => onPrint("driver")}><Printer size={15} aria-hidden="true" /> Print driver summary</button></div>
      {!data.vehicles.length ? <EmptyState title="No vehicles" description="Driver summaries appear once vehicles have journeys." /> : data.vehicles.map((vehicle) => {
        const runs = data.journeys.filter((journey) => journey.vehicle_id === vehicle.id && journey.status !== "cancelled");
        return <Card key={vehicle.id} title={`${vehicle.label}${vehicle.driver_name ? ` · ${vehicle.driver_name}` : ""}`} subtitle={`${vehicle.passenger_capacity} seats${vehicle.driver_phone ? ` · ${vehicle.driver_phone}` : ""} · generated ${formatDateTime(data.loadedAt, tz)}`}>
          {!runs.length ? <p className="field-help">No active journeys.</p> : <ol className="run-sheet">{runs.map((journey) => {
            const onboard = data.passengers.filter((row) => row.journey_id === journey.id);
            return <li key={journey.id}><p className="row-title">{formatDateTime(journey.pickup_at, tz)} · {journey.pickup_location} → {journey.dropoff_location}</p>
              <p className="row-meta">{JOURNEY_KIND_LABELS[journey.kind as keyof typeof JOURNEY_KIND_LABELS]} · {describeStatus("journey", journey.status).text} · {onboard.length}/{vehicle.passenger_capacity} passengers{journey.coordinator_user_id ? ` · Coordinator ${memberName.get(journey.coordinator_user_id) ?? ""}` : ""}</p>
              {journey.status_note && <p className="travel-delay">{journey.status_note}</p>}
              <ul>{onboard.map((row) => { const guest = guestById.get(row.guest_id); return <li key={row.guest_id}>{guestName.get(row.guest_id)}{data.canSeeGuestContacts && guest?.phone ? ` · ${guest.phone}` : ""}{guest?.assistance_needs ? ` · Assistance: ${guest.assistance_needs}` : ""}</li>; })}</ul>
            </li>;
          })}</ol>}
        </Card>;
      })}
    </section>
  </>;
}
