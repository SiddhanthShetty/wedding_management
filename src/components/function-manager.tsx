"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Archive, CalendarPlus, Pencil } from "lucide-react";
import { archiveFunctionAction, createFunctionAction, updateFunctionAction } from "@/app/actions/functions";
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

const templates: Array<Pick<Draft, "name" | "functionType">> = [
  { name: "Haldi", functionType: "Haldi" },
  { name: "Mehendi", functionType: "Mehendi" },
  { name: "Sangeet", functionType: "Sangeet" },
  { name: "Wedding", functionType: "Wedding" },
  { name: "Reception", functionType: "Reception" },
];

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
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function localTimeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-IE", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

function scheduleLabel(date: string | null, start: string | null, end: string | null, timezone: string) {
  if (!date) return "Date and time to be decided";
  if (!start && !end) return localDateLabel(date) + " · Time to be decided · " + timezone;
  if (start && !end) return localDateLabel(date) + " · " + localTimeLabel(start) + " · end time TBD · " + timezone;
  if (!start && end) return localDateLabel(date) + " · start time TBD · " + timezone;
  if (!start || !end) return localDateLabel(date) + " · Time to be decided · " + timezone;
  const crossesMidnight = end.slice(0, 5) < start.slice(0, 5);
  return localDateLabel(date) + " · " + localTimeLabel(start) + "–" + localTimeLabel(end)
    + (crossesMidnight ? " (ends next day)" : "") + " · " + timezone;
}

export function FunctionManager({
  weddingId,
  timezone,
  currency,
  functions,
  arrangements,
  canEdit,
}: {
  weddingId: string;
  timezone: string;
  currency: string;
  functions: WeddingFunction[];
  arrangements: FunctionTaskArrangement[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<WeddingFunction | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
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
    <Card title="Wedding functions" subtitle={activeFunctions.length + " active · Planning timezone: " + timezone} action={canEdit
      ? <Button onClick={() => { setEditing(undefined); setEditorOpen(true); }}><CalendarPlus size={15} aria-hidden="true" /> Add function</Button>
      : undefined}>
      {!activeFunctions.length
        ? <EmptyState title="No functions yet" description={canEdit ? "Add a function or start with an editable ceremony template." : "A planning editor can add the first function."} />
        : <DataTable label="Wedding functions" headers={["Function", "Date and time", "Location", "Plan", "Status", ...(canEdit ? ["Actions"] : [])]}>
          {activeFunctions.map((item) => <tr key={item.id}>
            <td><span className="table-primary">{item.name}</span><span className="table-secondary">{item.function_type} · <a className="text-link" href={`/documents?entity=function&id=${item.id}`}>Files</a></span></td>
            <td>{scheduleLabel(item.function_date, item.start_time, item.end_time, timezone)}</td>
            <td>{item.venue_name || "Location to be decided"}</td>
            <td>{item.expected_attendance == null ? "Attendance TBD" : item.expected_attendance.toLocaleString("en-IE") + " expected"}
              {item.budget_allocation != null && <span className="table-secondary">{new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(item.budget_allocation))} allocation</span>}
            </td>
            <td><StageBadge kind="function" status={item.status} /></td>
            {canEdit && <td><div className="function-actions">
              <Button variant="secondary" aria-label={"Edit " + item.name} onClick={() => { setEditing(item); setEditorOpen(true); }}><Pencil size={14} aria-hidden="true" /> Edit</Button>
              <ArchiveFunctionButton weddingId={weddingId} item={item} linkedTasks={arrangements.filter((arrangement) => arrangement.function_id === item.id)} onArchived={onArchived} />
            </div></td>}
          </tr>)}
        </DataTable>}
      {!canEdit && <p className="field-help">You have read-only access to planning functions.</p>}
    </Card>
    {archivedFunctions.length > 0 && <Card title="Archived functions" subtitle="Archived records remain in the wedding history.">
      <details>
        <summary className="archive-summary">Show {archivedFunctions.length} archived {archivedFunctions.length === 1 ? "function" : "functions"}</summary>
        <DataTable label="Archived wedding functions" headers={["Function", "Date and time", "Location", "Status"]}>
          {archivedFunctions.map((item) => <tr key={item.id}>
            <td><span className="table-primary">{item.name}</span><span className="table-secondary">{item.function_type}</span></td>
            <td>{scheduleLabel(item.function_date, item.start_time, item.end_time, timezone)}</td>
            <td>{item.venue_name || "Location not set"}</td>
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
    <p id="function-editor-description" className="dialog-copy">Schedule entries use {timezone}. An end time earlier than the start time means the function ends the following day.</p>
    <form action={formAction} className="function-editor-form">
      <input type="hidden" name="weddingId" value={weddingId} />
      {item && <input type="hidden" name="functionId" value={item.id} />}
      <div className="field">
        <label className="field-label" htmlFor="function-template">Editable template</label>
        <select id="function-template" className="field-control" value="" onChange={(event) => {
          const selected = templates.find((template) => template.functionType === event.target.value);
          if (selected) setDraft((previous) => ({ ...previous, name: selected.name, functionType: selected.functionType }));
        }}>
          <option value="">Choose a template or keep a custom function</option>
          {templates.map((template) => <option key={template.functionType} value={template.functionType}>{template.name}</option>)}
        </select>
        <span className="field-help">The name and type remain editable after choosing a template.</span>
      </div>
      <div className="field-grid">
        {field("name", "Function name", "text", { required: true, maxLength: 160 })}
        {field("functionType", "Function type", "text", { required: true, maxLength: 80 })}
        {field("functionDate", "Date", "date")}
        <div className="field">
          <label className="field-label" htmlFor="function-status">Status</label>
          <select id="function-status" className="field-control" name="status" value={draft.status} onChange={(event) => set("status", event.target.value)}>
            <option value="tentative">Tentative</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {field("startTime", "Start time", "time")}
        {field("endTime", "End time", "time")}
        {field("venueName", "Location or venue", "text", { maxLength: 240 })}
        {field("guestMapUrl", "Guest map link (https)", "url", { maxLength: 2048 })}
        {field("expectedAttendance", "Expected attendance", "number", { min: "0" })}
        {field("budgetAllocation", "Budget allocation (" + currency + ")", "number", { min: "0", step: "0.01" })}
        {field("coordinatorName", "Coordinator", "text", { maxLength: 160 })}
        {field("dressCode", "Dress code", "text", { maxLength: 240 })}
        <div className="field field-full">
          <label className="field-label" htmlFor="function-notes">Notes</label>
          <textarea id="function-notes" className="field-control" name="notes" value={draft.notes} maxLength={10000} onChange={(event) => set("notes", event.target.value)} />
        </div>
      </div>
      {changedDate && <section className="impact-panel" aria-labelledby="function-impact-title">
        <h3 id="function-impact-title">Review schedule changes</h3>
        <p><strong>Current:</strong> {scheduleLabel(item?.function_date ?? null, item?.start_time ?? null, item?.end_time ?? null, timezone)}</p>
        <p><strong>Proposed:</strong> {scheduleLabel(draft.functionDate || null, draft.startTime || null, draft.endTime || null, timezone)}</p>
        <ul>
          <li>Task deadlines are not shifted automatically. Review the linked tasks below.</li>
          <li>Booking and invitation records are not changed or removed. Those modules are not connected to functions in this milestone.</li>
        </ul>
        {linkedTasks.length > 0
          ? <ul className="impact-arrangements" aria-label="Tasks linked to this function">{linkedTasks.map((task) => <li key={task.id}>{task.title}{task.due_date ? " · due " + localDateLabel(task.due_date) : " · no due date"}{task.status === "completed" ? " · completed" : ""}</li>)}</ul>
          : <p className="field-help">No tasks are currently linked to this function.</p>}
      </section>}
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save function" : "Create function"}</Button>
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
