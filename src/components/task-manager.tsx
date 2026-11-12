"use client";
import { matchesTaskView, TASK_VIEWS, type TaskView } from "@/lib/planning/task-rules";
import { useRememberedState } from "@/components/use-remembered";
import { ActionForm } from "@/components/action-form";
import { completeTasksAction } from "@/app/actions/bulk";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { CheckSquare2, CirclePlus, Pencil } from "lucide-react";
import {
  addTaskChecklistItemAction, addTaskCommentAction, createTaskAction,
  toggleTaskChecklistAction, updateTaskAction,
} from "@/app/actions/tasks";
import { Button, Card, EmptyState, NotificationRegion, StageBadge } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import type { WeddingFunction } from "@/lib/data/functions";
import type { WeddingTask } from "@/lib/data/tasks";
import { isTaskOverdue, wouldCreateDependencyCycle } from "@/lib/planning/task-rules";
import { groupTasksByWhen } from "@/lib/planning/task-timeline";
import { newTemplateItems, TASK_CHECKLIST, templateDueDate, type TaskTemplate } from "@/lib/planning/starter-templates";
import { applyTaskChecklistAction } from "@/app/actions/setup";

type Assignee = { userId: string; role: string; name: string };

function formatDueDate(value: string | null) {
  if (!value) return "No due date";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}


export function TaskManager({
  weddingId,
  currentUserId,
  timezone,
  today,
  tasks,
  functions,
  assignees,
  canEdit,
  initialView = "all",
  viewFromUrl = false,
  weddingDate = null,
}: {
  weddingId: string;
  currentUserId: string;
  timezone: string;
  today: string;
  tasks: WeddingTask[];
  functions: WeddingFunction[];
  assignees: Assignee[];
  canEdit: boolean;
  initialView?: string;
  viewFromUrl?: boolean;
  weddingDate?: string | null;
}) {
  const [view, setView] = useRememberedState<TaskView>("tasks", initialView as TaskView, TASK_VIEWS, viewFromUrl);
  const [groupBy, setGroupBy] = useRememberedState<GroupBy>("tasks-group", "when", GROUP_OPTIONS, false);
  const [editor, setEditor] = useState<WeddingTask | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [selecting, setSelecting] = useState(false);
  const onSaved = useCallback((message: string) => { setNotice(message); setEditorOpen(false); }, []);
  const filtered = tasks.filter((task) => matchesTaskView(task, view as TaskView, currentUserId, today));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectable = (task: WeddingTask) => canEdit && task.status !== "completed" && task.status !== "cancelled";
  // Selection follows the latest data: finished or hidden tasks drop out automatically.
  const selected = filtered.filter((task) => selectable(task) && selectedIds.includes(task.id));
  const toggleSelected = (taskId: string) => setSelectedIds((current) => current.includes(taskId) ? current.filter((value) => value !== taskId) : [...current, taskId]);
  const groups = groupTasks(filtered, groupBy, today, weddingDate);
  const starterLeft = newTemplateItems(TASK_CHECKLIST, tasks.map((task) => task.title), (item) => item.title);

  return <>
    {canEdit && <QuickAddTask weddingId={weddingId} />}
    {canEdit && !tasks.length && <StarterTasks weddingId={weddingId} items={starterLeft} weddingDate={weddingDate} today={today} />}
    <Card title="Your tasks" subtitle={`${tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled").length} to do · ${tasks.filter((task) => task.status === "completed").length} done`}>
      <div className="task-toolbar">
        <div className="field">
          <label className="field-label" htmlFor="task-view">Show</label>
          <select id="task-view" className="field-control" value={view} onChange={(event) => setView(event.target.value as TaskView)}>
            <option value="all">Everything</option>
            <option value="mine-open">Mine, still to do</option>
            <option value="mine">All of mine</option>
            <option value="mine-overdue">Mine, overdue</option>
            <option value="overdue">Overdue</option>
            <option value="due-soon">Due in the next 7 days</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="task-group">Group by</label>
          <select id="task-group" className="field-control" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
            <option value="when">When it&apos;s due</option>
            <option value="function">Function</option>
            <option value="owner">Who&apos;s doing it</option>
            <option value="none">No grouping</option>
          </select>
        </div>
        {canEdit && <Button variant="secondary" onClick={() => { setEditor(undefined); setEditorOpen(true); }}><CirclePlus size={15} aria-hidden="true" /> Add with details</Button>}
        {canEdit && <Button variant="quiet" aria-pressed={selecting} onClick={() => { setSelecting((value) => !value); setSelectedIds([]); }}>{selecting ? "Stop selecting" : "Select several"}</Button>}
      </div>
      {selecting && selected.length > 0 && <div className="bulk-bar" role="region" aria-label="Selected tasks">
        <span><strong>{selected.length}</strong> selected</span>
        <ActionForm action={completeTasksAction} submitLabel="Mark selected done" variant="primary" className="inline-action-form">
          <input type="hidden" name="weddingId" value={weddingId} />
          {selected.map((task) => <input key={task.id} type="hidden" name="task" value={`${task.id}:${task.version}`} />)}
        </ActionForm>
        <Button variant="quiet" onClick={() => setSelectedIds([])}>Clear</Button>
      </div>}
      {!filtered.length
        ? <EmptyState title={tasks.length ? "Nothing in this view" : "No tasks yet"} description={tasks.length ? "Try “Everything” above." : canEdit ? "Type a task in the box above, or tick some of the usual ones." : "Nothing added yet."} />
        : <div className="task-group-list">
          {groups.map((group) => {
            const body = group.tasks.map((task) => <TaskCard key={task.id} task={task} weddingId={weddingId} today={today} canEdit={canEdit} selecting={selecting && selectable(task)} selected={selectedIds.includes(task.id)} onToggle={() => toggleSelected(task.id)} onEdit={() => { setEditor(task); setEditorOpen(true); }} />);
            if (group.done) return <details className="task-group task-group-done" key={group.key}><summary className="task-group-title">{group.label} ({group.tasks.length})</summary>{body}</details>;
            return <section className="task-group" key={group.key}>
              {groupBy !== "none" && <h3 className={`task-group-title ${group.key === "overdue" ? "is-overdue" : ""}`}>{group.label}{group.hint && <span className="task-group-hint"> · {group.hint}</span>}</h3>}
              {body}
            </section>;
          })}
        </div>}
      {canEdit && tasks.length > 0 && starterLeft.length > 0 && <details className="more-details"><summary>Add more of the usual tasks</summary><StarterTasks weddingId={weddingId} items={starterLeft} weddingDate={weddingDate} today={today} plain /></details>}
      {!canEdit && <p className="field-help">You can view this but not change it. Ask the couple if you need something changed.</p>}
      <p className="field-help">Due dates use {timezone.replace("Asia/Kolkata", "India")} time.</p>
    </Card>
    <TaskEditor key={editor?.id ?? "new-task"} open={editorOpen} weddingId={weddingId} task={editor} tasks={tasks} functions={functions} assignees={assignees} onClose={() => setEditorOpen(false)} onSaved={onSaved} />
    {notice && <NotificationRegion message={notice} onDismiss={() => setNotice("")} />}
  </>;
}

const GROUP_OPTIONS = ["when", "function", "owner", "none"] as const;
type GroupBy = typeof GROUP_OPTIONS[number];

function TaskCard({ task, weddingId, today, canEdit, selecting, selected, onToggle, onEdit }: { task: WeddingTask; weddingId: string; today: string; canEdit: boolean; selecting: boolean; selected: boolean; onToggle: () => void; onEdit: () => void }) {
  const open = task.status !== "completed" && task.status !== "cancelled";
  const overdue = isTaskOverdue(task, today);
  return <article className={`task-card ${open ? "" : "is-finished"}`}>
    <div className="task-card-main">
      <div className="task-card-title-row">
        {selecting && <input type="checkbox" className="task-select" checked={selected} onChange={onToggle} aria-label={"Select " + task.title} />}
        <h3 className="task-card-title">{task.title}</h3>
        {(task.status !== "not_started") && <StageBadge kind="task" status={task.status} />}
      </div>
      {task.description && <p className="task-card-description">{task.description}</p>}
      <div className="task-card-meta">
        <span>{task.due_date ? <>Due {formatDueDate(task.due_date)}</> : "No due date"}{overdue && <span className="task-overdue">Overdue</span>}</span>
        {task.owner_name && <span>{task.owner_name}</span>}
        {task.function_name && <span>{task.function_name}</span>}
        {(task.priority === "high" || task.priority === "urgent") && <span className="task-priority">{task.priority === "urgent" ? "Urgent" : "Important"}</span>}
        {task.supplier_id && <span>Vendor follow-up</span>}
      </div>
      {task.depends_on_task_id && task.dependency_status !== "completed" && <p className="task-dependency is-blocked"><strong>Waiting for:</strong> {task.dependency_title ?? "another task"}</p>}
      {canEdit && <div className="task-card-actions">
        {open && <ActionForm action={completeTasksAction} submitLabel="Done" pendingLabel="Saving…" variant="secondary" className="inline-action-form task-done-form" ariaLabel={`Mark ${task.title} done`}>
          <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="task" value={`${task.id}:${task.version}`} />
        </ActionForm>}
        <Button variant="quiet" aria-label={"Edit " + task.title} onClick={onEdit}><Pencil size={14} aria-hidden="true" /> Edit</Button>
      </div>}
    </div>
    <details className="task-detail">
      <summary><CheckSquare2 size={14} aria-hidden="true" /> Checklist and comments{task.checklist.length ? ` (${task.checklist.filter((item) => item.is_complete).length}/${task.checklist.length})` : ""}</summary>
      <TaskDetails weddingId={weddingId} task={task} canEdit={canEdit} />
    </details>
  </article>;
}

/** Type a task and press Enter. Everything else can be added later with Edit. */
function QuickAddTask({ weddingId }: { weddingId: string }) {
  const [state, formAction, pending] = useActionState(createTaskAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.savedId) { formRef.current?.reset(); titleRef.current?.focus(); } }, [state.savedId]);
  return <form ref={formRef} action={formAction} className="quick-add-task card" aria-label="Add a task">
    <input type="hidden" name="weddingId" value={weddingId} />
    {QUICK_DEFAULTS.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <div className="quick-add-row">
      <label className="sr-only" htmlFor="quick-task-title">New task</label>
      <input ref={titleRef} id="quick-task-title" className="field-control" name="title" required maxLength={200} placeholder="Add a task, e.g. Book the mehendi artist" autoComplete="off" />
      <label className="sr-only" htmlFor="quick-task-due">Due date (optional)</label>
      <input id="quick-task-due" className="field-control quick-add-date" type="date" name="dueDate" aria-describedby="quick-task-hint" />
      <Button type="submit" disabled={pending}><CirclePlus size={15} aria-hidden="true" /> {pending ? "Adding…" : "Add"}</Button>
    </div>
    <p id="quick-task-hint" className="field-help">Press Enter to add. The date is optional; add who&apos;s doing it and more with Edit.</p>
    {state.error && <p className="field-error" role="alert">{state.error}</p>}
    {!state.error && state.message && <p className="field-success" role="status">Added.</p>}
  </form>;
}

/** Values a one-line task needs; they match the full form's defaults. */
const QUICK_DEFAULTS: Array<[string, string]> = [["description", ""], ["functionId", ""], ["ownerUserId", ""], ["priority", "normal"], ["status", "not_started"], ["relatedVendorReference", ""], ["relatedBookingReference", ""], ["dependsOnTaskId", ""]];

function StarterTasks({ weddingId, items, weddingDate, today, plain = false }: { weddingId: string; items: TaskTemplate[]; weddingDate: string | null; today: string; plain?: boolean }) {
  const [state, formAction, pending] = useActionState(applyTaskChecklistAction, {});
  if (!items.length) return null;
  const when = (item: TaskTemplate) => {
    const due = templateDueDate(weddingDate, item.monthsBefore, today);
    const lead = item.monthsBefore >= 1 ? `${Math.round(item.monthsBefore)} month${Math.round(item.monthsBefore) === 1 ? "" : "s"} before` : item.monthsBefore >= 0.5 ? "2 weeks before" : "1 week before";
    return due ? `${lead} · due ${formatDueDate(due)}` : lead;
  };
  const body = <form action={formAction} className="starter-functions">
    <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="picking" value="1" />
    {!weddingDate && <p className="field-help">Set your wedding date in Settings and these get due dates counted back from it.</p>}
    <fieldset className="starter-list"><legend className="sr-only">Tasks to add</legend>
      {items.map((item) => <label key={item.title} className="checkbox-row"><input type="checkbox" name="starterTask" value={item.title} defaultChecked /><span><strong>{item.title}</strong> <span className="row-meta">{when(item)}</span></span></label>)}
    </fieldset>
    {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
    {!state.error && state.message && <p className="field-success" role="status">{state.message}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add ticked tasks"}</Button>
  </form>;
  return plain ? body : <Card title="Start with the usual checklist" subtitle="Tick the ones that apply. Untick anything you've already done or don't need.">{body}</Card>;
}

function groupTasks(tasks: WeddingTask[], groupBy: GroupBy, today: string, weddingDate: string | null): Array<{ key: string; label: string; hint: string | null; tasks: WeddingTask[]; done?: boolean }> {
  if (groupBy === "when") return groupTasksByWhen(tasks, today, weddingDate);
  const grouped = new Map<string, WeddingTask[]>();
  for (const task of tasks) {
    const label = groupBy === "function" ? task.function_name ?? "Whole wedding"
      : groupBy === "owner" ? task.owner_name ?? "Not assigned" : "Tasks";
    grouped.set(label, [...(grouped.get(label) ?? []), task]);
  }
  return [...grouped.entries()].map(([label, rows]) => ({ key: label, label, hint: null, tasks: rows }));
}

function TaskEditor({
  open, weddingId, task, tasks, functions, assignees, onClose, onSaved,
}: {
  open: boolean;
  weddingId: string;
  task?: WeddingTask;
  tasks: WeddingTask[];
  functions: WeddingFunction[];
  assignees: Assignee[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const action = task ? updateTaskAction : createTaskAction;
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.savedId) onSaved(state.message ?? "Task saved.");
  }, [state.savedId, state.message, onSaved]);
  const [dependencyId, setDependencyId] = useState(task?.depends_on_task_id ?? "");
  const hasCycle = Boolean(task && dependencyId && wouldCreateDependencyCycle(task.id, dependencyId, tasks));
  const disabledDependencies = new Set(tasks.filter((candidate) => task && candidate.id !== task.id
    && wouldCreateDependencyCycle(task.id, candidate.id, tasks)).map((candidate) => candidate.id));
  const currentOwnerPresent = Boolean(task?.owner_user_id && assignees.some((member) => member.userId === task.owner_user_id));

  return <Dialog open={open} className="planning-editor-dialog" titleId="task-editor-title" descriptionId="task-editor-description" onClose={onClose}>
    <h2 id="task-editor-title" className="dialog-title">{task ? "Edit task" : "Add a task"}</h2>
    <p id="task-editor-description" className="dialog-copy">Only the task itself is needed. If someone else changes it at the same time, you&apos;ll be asked to refresh instead of overwriting their change.</p>
    <form action={formAction} className="function-editor-form">
      <input type="hidden" name="weddingId" value={weddingId} />
      {task && <><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="version" value={task.version} /></>}
      <div className="field-grid">
        <div className="field field-full"><label className="field-label" htmlFor="task-title">Task <span aria-hidden="true">*</span></label><input id="task-title" className="field-control" name="title" required maxLength={200} defaultValue={task?.title ?? ""} /></div>
        <div className="field"><label className="field-label" htmlFor="task-due">Due date</label><input id="task-due" className="field-control" type="date" name="dueDate" defaultValue={task?.due_date ?? ""} /></div>
        <div className="field"><label className="field-label" htmlFor="task-owner">Who&apos;s doing it</label><select id="task-owner" className="field-control" name="ownerUserId" defaultValue={task?.owner_user_id ?? ""}><option value="">Not assigned</option>{task?.owner_user_id && !currentOwnerPresent && <option value={task.owner_user_id}>Former member</option>}{assignees.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></div>
        <div className="field"><label className="field-label" htmlFor="task-status">Status</label><select id="task-status" className="field-control" name="status" defaultValue={task?.status ?? "not_started"}><option value="not_started">To do</option><option value="in_progress">Started</option><option value="blocked">Stuck</option><option value="completed">Done</option><option value="cancelled">Not needed</option></select></div>
      </div>
      <details className="more-details"><summary>More details: notes, function, priority, waiting for</summary><div className="field-grid">
        <div className="field field-full"><label className="field-label" htmlFor="task-description">Notes</label><textarea id="task-description" className="field-control" name="description" maxLength={10000} defaultValue={task?.description ?? ""} /></div>
        <div className="field"><label className="field-label" htmlFor="task-function">Function</label><select id="task-function" className="field-control" name="functionId" defaultValue={task?.function_id ?? ""}><option value="">Whole wedding</option>{functions.filter((item) => !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="field"><label className="field-label" htmlFor="task-priority">Priority</label><select id="task-priority" className="field-control" name="priority" defaultValue={task?.priority ?? "normal"}><option value="low">Low</option><option value="normal">Normal</option><option value="high">Important</option><option value="urgent">Urgent</option></select></div>
        <div className="field"><label className="field-label" htmlFor="task-dependency">Waiting for another task?</label><select id="task-dependency" className="field-control" name="dependsOnTaskId" value={dependencyId} onChange={(event) => setDependencyId(event.target.value)}><option value="">No</option>{tasks.filter((candidate) => candidate.id !== task?.id).map((candidate) => <option key={candidate.id} value={candidate.id} disabled={disabledDependencies.has(candidate.id)}>{candidate.title}{disabledDependencies.has(candidate.id) ? " · would wait on this one" : ""}</option>)}</select>{hasCycle && <span className="field-error" role="alert">Those two tasks would be waiting for each other.</span>}</div>
        <div className="field"><label className="field-label" htmlFor="task-vendor-reference">Vendor (note)</label><input id="task-vendor-reference" className="field-control" name="relatedVendorReference" maxLength={240} defaultValue={task?.related_vendor_reference ?? ""} aria-describedby="task-reference-hint" /></div>
        <div className="field"><label className="field-label" htmlFor="task-booking-reference">Booking (note)</label><input id="task-booking-reference" className="field-control" name="relatedBookingReference" maxLength={240} defaultValue={task?.related_booking_reference ?? ""} aria-describedby="task-reference-hint" /></div>
        <p id="task-reference-hint" className="field-help field-full">Type a vendor or booking name as a note. These aren’t linked to your vendor list yet.</p>
      </div></details>
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      <div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending || hasCycle}>{pending ? "Saving…" : task ? "Save" : "Add task"}</Button></div>
    </form>
  </Dialog>;
}

function TaskDetails({ weddingId, task, canEdit }: { weddingId: string; task: WeddingTask; canEdit: boolean }) {
  return <div className="task-details-content">
    <section><h4>Checklist</h4>{task.checklist.length
      ? <ul className="checklist">{task.checklist.map((item) => <li key={item.id}>
        <span className={item.is_complete ? "checklist-done" : ""}>{item.is_complete ? "✓ " : "○ "}{item.title}</span>
        {canEdit && <ChecklistToggle weddingId={weddingId} itemId={item.id} isComplete={item.is_complete} />}
      </li>)}</ul>
      : <p className="field-help">No checklist items yet.</p>}
      {canEdit && <ChecklistForm weddingId={weddingId} taskId={task.id} />}
    </section>
    <section><h4>Comments</h4>{task.comments.length
      ? <ul className="task-comments">{task.comments.map((comment) => <li key={comment.id}><span>{comment.body}</span><span className="table-secondary">{comment.author_name} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.created_at))}</span></li>)}</ul>
      : <p className="field-help">No comments yet.</p>}
      {canEdit && <CommentForm weddingId={weddingId} taskId={task.id} />}
    </section>
    <section><h4>History</h4>{task.activity.length
      ? <ul className="task-activity">{task.activity.map((event) => <li key={event.id}><span>{activityLabel(event.event_type)}</span><span className="table-secondary">{event.actor_name} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</span></li>)}</ul>
      : <p className="field-help">Nothing yet.</p>}</section>
  </div>;
}

function activityLabel(eventType: string) {
  const labels: Record<string, string> = { task_created: "Task created", task_updated: "Task updated", comment_added: "Comment added", checklist_item_changed: "Checklist changed" };
  return labels[eventType] ?? eventType;
}

function ChecklistForm({ weddingId, taskId }: { weddingId: string; taskId: string }) {
  const [state, action, pending] = useActionState(addTaskChecklistItemAction, {});
  return <form action={action} className="inline-action-form">
    <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="taskId" value={taskId} />
    <label className="sr-only" htmlFor={"checklist-title-" + taskId}>New checklist item</label>
    <input id={"checklist-title-" + taskId} name="title" className="field-control" required maxLength={300} placeholder="Add checklist item" />
    <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
  </form>;
}

function ChecklistToggle({ weddingId, itemId, isComplete }: { weddingId: string; itemId: string; isComplete: boolean }) {
  const [state, action, pending] = useActionState(toggleTaskChecklistAction, {});
  return <form action={action} className="checklist-toggle">
    <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="isComplete" value={String(!isComplete)} />
    <Button type="submit" variant="quiet" disabled={pending} aria-label={isComplete ? "Mark checklist item incomplete" : "Mark checklist item complete"}>{pending ? "Saving…" : isComplete ? "Undo" : "Complete"}</Button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
  </form>;
}

function CommentForm({ weddingId, taskId }: { weddingId: string; taskId: string }) {
  const [state, action, pending] = useActionState(addTaskCommentAction, {});
  return <form action={action} className="inline-action-form comment-form">
    <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="taskId" value={taskId} />
    <label className="sr-only" htmlFor={"task-comment-" + taskId}>Add a comment</label>
    <textarea id={"task-comment-" + taskId} className="field-control" name="body" required maxLength={4000} placeholder="Add a comment" />
    <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Posting…" : "Post comment"}</Button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
  </form>;
}
