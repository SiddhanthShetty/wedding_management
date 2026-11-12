"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Archive, CalendarPlus, Pencil } from "lucide-react";
import { addStarterFunctionsAction, archiveFunctionAction, createFunctionAction, moveFunctionsAction, updateFunctionAction } from "@/app/actions/functions";
import { earliestFunctionDate, moveSummary, planFunctionMove, sameDayNextYear } from "@/lib/planning/move-functions";
import { functionsByDay } from "@/lib/planning/function-timeline";
import { FUNCTION_TYPES, shiftDate, STARTER_FUNCTIONS } from "@/lib/planning/starter-functions";
import { timeZoneOptions } from "@/lib/locale";
import { Button, Card, DataTable, EmptyState, NotificationRegion, StageBadge, StatusLabel } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import type { FunctionTaskArrangement, WeddingFunction } from "@/lib/data/functions";

type Draft = {
  name: string;
  functionType: string;
  functionDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  guestMapUrl: string;
  status: "tentative" | "confirmed" | "cancelled";
  expectedAttendance: string;
  budgetAllocation: string;
  coordinatorName: string;
  dressCode: string;
  notes: string;
};

const blankDraft: Draft = {
  name: "", functionType: "custom", functionDate: "", startTime: "", endTime: "",
  venueName: "", guestMapUrl: "", status: "tentative", expectedAttendance: "", budgetAllocation: "",
  coordinatorName: "", dressCode: "", notes: "",
};

const zoneLabel = (zone: string) => timeZoneOptions(zone).find((option) => option.id === zone)?.label ?? zone;

function toDraft(item?: WeddingFunction): Draft {
  if (!item) return blankDraft;
  return {
    name: item.name,
    functionType: item.function_type,
    functionDate: item.function_date ?? "",
    startTime: item.start_time?.slice(0, 5) ?? "",
    endTime: item.end_time?.slice(0, 5) ?? "",
    venueName: item.venue_name ?? "",
    guestMapUrl: item.guest_map_url ?? "",
    status: item.status,
    expectedAttendance: item.expected_attendance == null ? "" : String(item.expected_attendance),
    budgetAllocation: item.budget_allocation == null ? "" : String(item.budget_allocation),
    coordinatorName: item.coordinator_name ?? "",
    dressCode: item.dress_code ?? "",
    notes: item.notes ?? item.description ?? "",
  };
}

function localDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function localTimeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

function scheduleLabel(date: string | null, start: string | null, end: string | null, _timezone: string) {
  // The time zone is shown once above the list, so it isn't repeated on every line.
  if (!date) return "Date not set yet";
  const day = localDateLabel(date);
  if (!start && !end) return day + " · time not set yet";
  if (start && !end) return day + " · " + localTimeLabel(start);
  if (!start && end) return day + " · until " + localTimeLabel(end);
  const crossesMidnight = end!.slice(0, 5) < start!.slice(0, 5);
  return day + " · " + localTimeLabel(start!) + "–" + localTimeLabel(end!) + (crossesMidnight ? " (ends next day)" : "");
}

export function FunctionManager({
  weddingId,
  timezone,
  currency,
  functions,
  arrangements,
  canEdit,
  weddingDate = null,
  initialAdd = false,
}: {
  initialAdd?: boolean;
  weddingId: string;
  timezone: string;
  currency: string;
  weddingDate?: string | null;
  functions: WeddingFunction[];
  arrangements: FunctionTaskArrangement[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<WeddingFunction | undefined>();
  const [editorOpen, setEditorOpen] = useState(initialAdd && canEdit);
  const [notice, setNotice] = useState("");
  const activeFunctions = functions.filter((item) => !item.archived_at);
  const archivedFunctions = functions.filter((item) => item.archived_at);

  const saved = useCallback((message: string) => {
    setEditorOpen(false);
    setEditing(undefined);
    setNotice(message);
  }, []);
  const onArchived = useCallback((name: string) => setNotice(name + " archived."), []);

  return <>
    {canEdit && !activeFunctions.length && <StarterFunctions weddingId={weddingId} weddingDate={weddingDate} onAdded={setNotice} />}
    <Card title="Wedding functions" subtitle={`${activeFunctions.length} ${activeFunctions.length === 1 ? "function" : "functions"} · times in ${zoneLabel(timezone)} time`} action={canEdit
      ? <Button onClick={() => { setEditing(undefined); setEditorOpen(true); }}><CalendarPlus size={15} aria-hidden="true" /> Add function</Button>
      : undefined}>
      {!activeFunctions.length
        ? <EmptyState title="No functions yet" description={canEdit ? "Tick the usual functions above, or add your own." : "Nothing added yet."} />
        : <ol className="function-timeline" aria-label="Wedding functions by day">
          {functionsByDay(activeFunctions).map((day) => <li key={day.date ?? "undated"} className="function-day">
            <h3 className="function-day-title">{day.date ? weekdayDateLabel(day.date) : "Date not set yet"}</h3>
            <ul className="function-day-list">{day.items.map((item) => <li key={item.id} id={`function-${item.id}`} className="function-item">
              <div className="function-item-time">{item.start_time ? localTimeLabel(item.start_time) : "Time TBC"}{item.end_time && <span>to {localTimeLabel(item.end_time)}</span>}</div>
              <div className="function-item-body">
                <div className="function-item-head"><h4>{item.name}</h4><StageBadge kind="function" status={item.status} /></div>
                <p className="function-item-meta">
                  <span>{item.venue_name || "Place not set yet"}</span>
                  {item.expected_attendance != null && <span>{item.expected_attendance.toLocaleString("en-IN")} guests</span>}
                  {item.dress_code && <span>Wear: {item.dress_code}</span>}
                  {item.budget_allocation != null && <span>{new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(item.budget_allocation))} budget</span>}
                </p>
                <div className="function-actions">
                  {canEdit && <Button variant="secondary" aria-label={"Edit " + item.name} onClick={() => { setEditing(item); setEditorOpen(true); }}><Pencil size={14} aria-hidden="true" /> Edit</Button>}
                  <a className="button button-quiet" href={`/documents?entity=function&id=${item.id}`}>Files</a>
                  {canEdit && <ArchiveFunctionButton weddingId={weddingId} item={item} linkedTasks={arrangements.filter((arrangement) => arrangement.function_id === item.id)} onArchived={onArchived} />}
                </div>
              </div>
            </li>)}</ul>
          </li>)}
        </ol>}
      {!canEdit && <p className="field-help">You can view this but not change it. Ask the couple if you need something changed.</p>}
      {canEdit && earliestFunctionDate(activeFunctions) && <details className="more-details"><summary>Move all dates</summary><MoveFunctionDates weddingId={weddingId} functions={activeFunctions} onMoved={setNotice} /></details>}
      {canEdit && activeFunctions.length > 0 && <details className="more-details"><summary>Add more of the usual functions</summary><StarterFunctions weddingId={weddingId} weddingDate={weddingDate} onAdded={setNotice} existing={activeFunctions.map((item) => item.name.toLowerCase())} plain /></details>}
    </Card>
    {archivedFunctions.length > 0 && <Card title="Archived functions" subtitle="Archived records remain in the wedding history.">
      <details>
        <summary className="archive-summary">Show {archivedFunctions.length} archived {archivedFunctions.length === 1 ? "function" : "functions"}</summary>
        <DataTable label="Archived wedding functions" headers={["Function", "Date and time", "Location", "Status"]}>
          {archivedFunctions.map((item) => <tr key={item.id}>
            <td><span className="table-primary">{item.name}</span><span className="table-secondary">{item.function_type}</span></td>
            <td>{scheduleLabel(item.function_date, item.start_time, item.end_time, timezone)}</td>
            <td>{item.venue_name || "Place not set"}</td>
            <td><StatusLabel>Archived</StatusLabel></td>
          </tr>)}
        </DataTable>
      </details>
    </Card>}
    <FunctionEditor key={editing?.id ?? "new-function"} open={editorOpen} weddingId={weddingId} timezone={timezone} currency={currency} item={editing} linkedTasks={editing ? arrangements.filter((arrangement) => arrangement.function_id === editing.id) : []} onClose={() => setEditorOpen(false)} onSaved={saved} />
    {notice && <NotificationRegion message={notice} onDismiss={() => setNotice("")} />}
  </>;
}

function FunctionEditor({
  open,
  weddingId,
  timezone,
  currency,
  item,
  linkedTasks,
  onClose,
  onSaved,
}: {
  open: boolean;
  weddingId: string;
  timezone: string;
  currency: string;
  item?: WeddingFunction;
  linkedTasks: FunctionTaskArrangement[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const action = item ? updateFunctionAction : createFunctionAction;
  const [state, formAction, pending] = useActionState(action, {});
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  useEffect(() => {
    if (state.savedId) onSaved(state.message ?? "Function saved.");
  }, [state.savedId, state.message, onSaved]);
  const changedDate = Boolean(item) && (
    item?.function_date !== (draft.functionDate || null)
    || item?.start_time?.slice(0, 5) !== (draft.startTime || null)
    || item?.end_time?.slice(0, 5) !== (draft.endTime || null)
  );
  const set = (key: keyof Draft, value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  const field = (key: keyof Draft, label: string, type = "text", options?: { required?: boolean; maxLength?: number; min?: string; step?: string }) => <div className="field">
    <label className="field-label" htmlFor={"function-" + key}>{label}{options?.required && <span aria-hidden="true"> *</span>}</label>
    <input id={"function-" + key} className="field-control" name={key} type={type} value={draft[key]} required={options?.required} maxLength={options?.maxLength} min={options?.min} step={options?.step} onChange={(event) => set(key, event.target.value)} />
  </div>;

  return <Dialog open={open} className="function-editor-dialog" titleId="function-editor-title" descriptionId="function-editor-description" onClose={onClose}>
    <h2 id="function-editor-title" className="dialog-title">{item ? "Edit function" : "Add a function"}</h2>
    <p id="function-editor-description" className="dialog-copy">Times are in {zoneLabel(timezone)} time. An end time earlier than the start time means it ends the next day.</p>
    <form action={formAction} className="function-editor-form">
      <input type="hidden" name="weddingId" value={weddingId} />
      {item && <input type="hidden" name="functionId" value={item.id} />}
      <div className="field-grid">
        {field("name", "Name", "text", { required: true, maxLength: 160 })}
        <div className="field">
          <label className="field-label" htmlFor="function-functionType">Type<span aria-hidden="true"> *</span></label>
          <input id="function-functionType" className="field-control" name="functionType" list="function-type-options" required maxLength={80} value={draft.functionType === "custom" ? "" : draft.functionType} placeholder="Choose or type" onChange={(event) => set("functionType", event.target.value)} />
          <datalist id="function-type-options">{FUNCTION_TYPES.map((type) => <option key={type} value={type} />)}</datalist>
        </div>
        {field("functionDate", "Date", "date")}
        <div className="field">
          <label className="field-label" htmlFor="function-status">Status</label>
          <select id="function-status" className="field-control" name="status" value={draft.status} onChange={(event) => set("status", event.target.value)}>
            <option value="tentative">Not confirmed yet</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {field("startTime", "Start time", "time")}
        {field("endTime", "End time", "time")}
        {field("venueName", "Venue or place", "text", { maxLength: 240 })}
        {field("dressCode", "Dress code", "text", { maxLength: 240 })}
      </div>
      <details className="more-details"><summary>More details</summary>
        <div className="field-grid">
          {field("guestMapUrl", "Map link for guests (https)", "url", { maxLength: 2048 })}
          {field("expectedAttendance", "Expected guests", "number", { min: "0" })}
          {field("budgetAllocation", "Budget for this function (" + currency + ")", "number", { min: "0", step: "0.01" })}
          {field("coordinatorName", "Person in charge", "text", { maxLength: 160 })}
          <div className="field field-full">
            <label className="field-label" htmlFor="function-notes">Notes</label>
            <textarea id="function-notes" className="field-control" name="notes" value={draft.notes} maxLength={10000} onChange={(event) => set("notes", event.target.value)} />
          </div>
        </div>
      </details>
      {changedDate && <section className="impact-panel" aria-labelledby="function-impact-title">
        <h3 id="function-impact-title">Review schedule changes</h3>
        <p><strong>Current:</strong> {scheduleLabel(item?.function_date ?? null, item?.start_time ?? null, item?.end_time ?? null, timezone)}</p>
        <p><strong>Proposed:</strong> {scheduleLabel(draft.functionDate || null, draft.startTime || null, draft.endTime || null, timezone)}</p>
        <ul>
          <li>Task deadlines are not shifted automatically. Review the linked tasks below.</li>
          <li>Bookings and guest invitations are not changed.</li>
        </ul>
        {linkedTasks.length > 0
          ? <ul className="impact-arrangements" aria-label="Tasks linked to this function">{linkedTasks.map((task) => <li key={task.id}>{task.title}{task.due_date ? " · due " + localDateLabel(task.due_date) : " · no due date"}{task.status === "completed" ? " · completed" : ""}</li>)}</ul>
          : <p className="field-help">No tasks are currently linked to this function.</p>}
      </section>}
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save function" : "Add function"}</Button>
      </div>
    </form>
  </Dialog>;
}

function ArchiveFunctionButton({ weddingId, item, linkedTasks, onArchived }: { weddingId: string; item: WeddingFunction; linkedTasks: FunctionTaskArrangement[]; onArchived: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(archiveFunctionAction, {});
  useEffect(() => {
    if (state.message && open) { setOpen(false); onArchived(item.name); }
    // Close once per new result; reopening the dialog must not close it again on the old message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.message, onArchived]);
  const titleId = "archive-" + item.id + "-title";
  const descriptionId = "archive-" + item.id + "-description";
  return <>
    <Button variant="quiet" aria-label={"Archive " + item.name} onClick={() => setOpen(true)}><Archive size={14} aria-hidden="true" /> Archive</Button>
    <Dialog open={open} role="alertdialog" titleId={titleId} descriptionId={descriptionId} onClose={() => setOpen(false)}>
      <h2 id={titleId} className="dialog-title">Archive {item.name}?</h2>
      <p id={descriptionId} className="dialog-copy">The function will leave the active list but remain in wedding history. {linkedTasks.length} linked {linkedTasks.length === 1 ? "task remains" : "tasks remain"} attached; none will be deleted or rescheduled.</p>
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      <form action={formAction} className="dialog-actions">
        <input type="hidden" name="weddingId" value={weddingId} />
        <input type="hidden" name="functionId" value={item.id} />
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Keep function</Button>
        <Button type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive function"}</Button>
      </form>
    </Dialog>
  </>;
}

/** One tap to add the usual functions, dated around the wedding day when it is known. */
function weekdayDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** Pick a new date for the first function; every other dated function moves by the same number of days. */
function MoveFunctionDates({ weddingId, functions, onMoved }: { weddingId: string; functions: WeddingFunction[]; onMoved: (message: string) => void }) {
  const [state, formAction, pending] = useActionState(moveFunctionsAction, {});
  const first = earliestFunctionDate(functions) ?? "";
  const [day, setDay] = useState(first);
  useEffect(() => { if (state.savedId && state.message) onMoved(state.message); }, [state.savedId, state.message, onMoved]);
  let plan: ReturnType<typeof planFunctionMove> = { days: 0, moves: [] };
  try { if (day) plan = planFunctionMove(functions, day); } catch { /* an incomplete date while typing */ }
  return <form action={formAction} className="move-functions">
    <input type="hidden" name="weddingId" value={weddingId} />
    <p className="field-help">Choose the new date for your first function, {weekdayDateLabel(first)}. The others move by the same number of days, so the gaps between them stay the same. Times don&apos;t change.</p>
    <div className="move-functions-pick">
      <div className="field"><label className="field-label" htmlFor="move-first-day">New date for the first function</label>
        <input id="move-first-day" className="field-control" type="date" name="newFirstDate" value={day} onChange={(event) => setDay(event.target.value)} required /></div>
      <Button type="button" variant="secondary" onClick={() => setDay(sameDayNextYear(first))}>Same dates next year</Button>
    </div>
    {plan.moves.length > 0 && <div className="move-functions-preview" aria-live="polite">
      <p><strong>{plan.moves.length} function{plan.moves.length === 1 ? "" : "s"} will move {moveSummary(plan.days)}:</strong></p>
      <ul>{plan.moves.map((move) => <li key={move.id}><span>{move.name}</span> <span className="row-meta">{weekdayDateLabel(move.from)} → <strong>{weekdayDateLabel(move.to)}</strong></span></li>)}</ul>
      <p className="field-help">Functions without a date are left as they are. Run-sheet times and task due dates don&apos;t move.</p>
    </div>}
    {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
    <Button type="submit" disabled={pending || !plan.moves.length}>{pending ? "Moving…" : plan.moves.length ? `Move ${plan.moves.length} function${plan.moves.length === 1 ? "" : "s"}` : "Pick a different date"}</Button>
  </form>;
}

function StarterFunctions({ weddingId, weddingDate, onAdded, existing = [], plain = false }: { weddingId: string; weddingDate: string | null; onAdded: (message: string) => void; existing?: string[]; plain?: boolean }) {
  const [state, formAction, pending] = useActionState(addStarterFunctionsAction, {});
  const [day, setDay] = useState(weddingDate ?? "");
  useEffect(() => { if (state.savedId && state.message) onAdded(state.message); }, [state.savedId, state.message, onAdded]);
  const options = STARTER_FUNCTIONS.filter((item) => !existing.includes(item.name.toLowerCase()));
  if (!options.length) return <p className="field-help">All the usual functions are already added.</p>;
  const when = (offset: number | null, time: string) => !day || offset === null ? "date to be decided" : `${localDateLabel(shiftDate(day, offset))}${time ? ` · ${localTimeLabel(time)}` : ""}`;
  const body = <form action={formAction} className="starter-functions">
    <input type="hidden" name="weddingId" value={weddingId} />
    <div className="field"><label className="field-label" htmlFor="starter-day">Wedding day</label>
      <input id="starter-day" className="field-control" type="date" name="weddingDay" value={day} onChange={(event) => setDay(event.target.value)} />
      <span className="field-help">Pre-wedding functions are placed the day before. Change any date or time afterwards.</span></div>
    <fieldset className="starter-list"><legend className="sr-only">Functions to add</legend>
      {options.map((item) => <label key={item.key} className="checkbox-row"><input type="checkbox" name={`starter-${item.key}`} defaultChecked={item.picked} /><span><strong>{item.name}</strong> <span className="row-meta">{when(item.dayOffset, item.startTime)}</span></span></label>)}
    </fieldset>
    {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add ticked functions"}</Button>
  </form>;
  return plain ? body : <Card title="Start with the usual functions" subtitle="Tick the ones you're having. They're added as “not confirmed yet”, ready to edit.">{body}</Card>;
}
