"use client";
import { matchesTaskView, type TaskView } from "@/lib/planning/task-rules";

import { useActionState, useCallback, useEffect, useState } from "react";
import { CheckSquare2, CirclePlus, Pencil } from "lucide-react";
import {
  addTaskChecklistItemAction, addTaskCommentAction, createTaskAction,
  toggleTaskChecklistAction, updateTaskAction,
} from "@/app/actions/tasks";
import type { TaskFormState } from "@/app/actions/tasks";
import { Button, Card, EmptyState, NotificationRegion, StatusLabel } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import type { WeddingFunction } from "@/lib/data/functions";
import type { WeddingTask } from "@/lib/data/tasks";
import { isTaskDueSoon, isTaskOverdue, wouldCreateDependencyCycle } from "@/lib/planning/task-rules";

type Assignee = { userId: string; role: string; name: string };

function formatDueDate(value: string | null) {
  if (!value) return "No due date";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

const statusLabels: Record<WeddingTask["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

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
}) {
  const [view, setView] = useState(initialView);
  const [groupBy, setGroupBy] = useState("none");
  const [editor, setEditor] = useState<WeddingTask | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const onSaved = useCallback((message: string) => setNotice(message), []);
  const filtered = tasks.filter((task) => matchesTaskView(task, view as TaskView, currentUserId, today));
  const groups = groupTasks(filtered, groupBy);

  return <>
    <Card title="Task board" subtitle={tasks.length + " tasks · Due dates use wedding-local calendar days · " + timezone}>
      <div className="task-toolbar">
        <div className="field">
          <label className="field-label" htmlFor="task-view">View</label>
          <select id="task-view" className="field-control" value={view} onChange={(event) => setView(event.target.value)}>
            <option value="mine">My tasks</option>
            <option value="mine-open">My open tasks</option>
            <option value="mine-overdue">My overdue tasks</option>
            <option value="all">All tasks</option>
            <option value="overdue">Overdue</option>
            <option value="due-soon">Due soon · next 7 days</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="task-group">Group by</label>
          <select id="task-group" className="field-control" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
            <option value="none">No grouping</option>
            <option value="function">Function</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        {canEdit && <Button onClick={() => { setEditor(undefined); setEditorOpen(true); }}><CirclePlus size={15} aria-hidden="true" /> Add task</Button>}
      </div>
      {!filtered.length
        ? <EmptyState title={tasks.length ? "No tasks in this view" : "No tasks yet"} description={tasks.length ? "Try another view or check the due dates." : canEdit ? "Add a task to start planning." : "A planning editor can add the first task."} />
        : <div className="task-group-list">
          {[...groups.entries()].map(([label, rows]) => <section className="task-group" key={label}>
            {groupBy !== "none" && <h3 className="task-group-title">{label}</h3>}
            {rows.map((task) => <article className="task-card" key={task.id}>
              <div className="task-card-main">
                <div className="task-card-title-row">
                  <h3 className="task-card-title">{task.title}</h3>
                  <StatusLabel>{statusLabels[task.status]}</StatusLabel>
                  {canEdit && <Button variant="quiet" aria-label={"Edit " + task.title} onClick={() => { setEditor(task); setEditorOpen(true); }}><Pencil size={14} aria-hidden="true" /> Edit</Button>}
                </div>
                <p className="task-card-description">{task.description || "No description"}</p>
                <div className="task-card-meta">
                  <span><strong>Due:</strong> {formatDueDate(task.due_date)}{isTaskOverdue(task, today) && <span className="task-overdue">Overdue</span>}</span>
                  <span><strong>Priority:</strong> {task.priority}</span>
                  <span><strong>Owner:</strong> {task.owner_name ?? "Unassigned"}</span>
                  <span><strong>Function:</strong> {task.function_name ?? "Wedding-wide"}</span>
                  {task.supplier_id && <span><strong>Linked to:</strong> Supplier follow-up</span>}
                </div>
                {task.depends_on_task_id && <p className={task.dependency_status === "completed" ? "task-dependency" : "task-dependency is-blocked"}>
                  <strong>{task.dependency_status === "completed" ? "Depends on" : "Blocked by"}:</strong> {task.dependency_title ?? "Another task"}
                  {task.dependency_status && task.dependency_status !== "completed" && " · prerequisite " + statusLabels[task.dependency_status as WeddingTask["status"]]}
                </p>}
              </div>
              <details className="task-detail">
                <summary><CheckSquare2 size={14} aria-hidden="true" /> Checklist, comments and activity</summary>
                <TaskDetails weddingId={weddingId} task={task} canEdit={canEdit} />
              </details>
            </article>)}
          </section>)}
        </div>}
      {!canEdit && <p className="field-help">You have read-only access to planning tasks.</p>}
    </Card>
    <TaskEditor key={editor?.id ?? "new-task"} open={editorOpen} weddingId={weddingId} task={editor} tasks={tasks} functions={functions} assignees={assignees} onClose={() => setEditorOpen(false)} onSaved={onSaved} />
    {notice && <NotificationRegion message={notice} onDismiss={() => setNotice("")} />}
  </>;
}

function groupTasks(tasks: WeddingTask[], groupBy: string): Map<string, WeddingTask[]> {
  const grouped = new Map<string, WeddingTask[]>();
  for (const task of tasks) {
    const label = groupBy === "function" ? task.function_name ?? "Wedding-wide"
      : groupBy === "owner" ? task.owner_name ?? "Unassigned" : "Tasks";
    grouped.set(label, [...(grouped.get(label) ?? []), task]);
  }
  return grouped;
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
    <h2 id="task-editor-title" className="dialog-title">{task ? "Edit task" : "Create task"}</h2>
    <p id="task-editor-description" className="dialog-copy">Changes use a version check. If someone else saves first, you’ll see their latest version instead of overwriting it.</p>
    <form action={formAction} className="function-editor-form">
      <input type="hidden" name="weddingId" value={weddingId} />
      {task && <><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="version" value={task.version} /></>}
      <div className="field-grid">
        <div className="field field-full"><label className="field-label" htmlFor="task-title">Title <span aria-hidden="true">*</span></label><input id="task-title" className="field-control" name="title" required maxLength={200} defaultValue={task?.title ?? ""} /></div>
        <div className="field field-full"><label className="field-label" htmlFor="task-description">Description</label><textarea id="task-description" className="field-control" name="description" maxLength={10000} defaultValue={task?.description ?? ""} /></div>
        <div className="field"><label className="field-label" htmlFor="task-function">Function</label><select id="task-function" className="field-control" name="functionId" defaultValue={task?.function_id ?? ""}><option value="">Wedding-wide</option>{functions.filter((item) => !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="field"><label className="field-label" htmlFor="task-owner">Owner</label><select id="task-owner" className="field-control" name="ownerUserId" defaultValue={task?.owner_user_id ?? ""}><option value="">Unassigned</option>{task?.owner_user_id && !currentOwnerPresent && <option value={task.owner_user_id}>Existing member (inactive)</option>}{assignees.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></div>
        <div className="field"><label className="field-label" htmlFor="task-due">Due date</label><input id="task-due" className="field-control" type="date" name="dueDate" defaultValue={task?.due_date ?? ""} /></div>
        <div className="field"><label className="field-label" htmlFor="task-priority">Priority</label><select id="task-priority" className="field-control" name="priority" defaultValue={task?.priority ?? "normal"}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
        <div className="field"><label className="field-label" htmlFor="task-status">Status</label><select id="task-status" className="field-control" name="status" defaultValue={task?.status ?? "not_started"}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
        <div className="field"><label className="field-label" htmlFor="task-dependency">Depends on</label><select id="task-dependency" className="field-control" name="dependsOnTaskId" value={dependencyId} onChange={(event) => setDependencyId(event.target.value)}><option value="">No dependency</option>{tasks.filter((candidate) => candidate.id !== task?.id).map((candidate) => <option key={candidate.id} value={candidate.id} disabled={disabledDependencies.has(candidate.id)}>{candidate.title}{disabledDependencies.has(candidate.id) ? " · would create a cycle" : ""}</option>)}</select>{hasCycle && <span className="field-error" role="alert">This dependency creates a circular chain.</span>}</div>
        <div className="field"><label className="field-label" htmlFor="task-vendor-reference">Related vendor reference</label><input id="task-vendor-reference" className="field-control" name="relatedVendorReference" maxLength={240} defaultValue={task?.related_vendor_reference ?? ""} aria-describedby="task-reference-hint" /></div>
        <div className="field"><label className="field-label" htmlFor="task-booking-reference">Related booking reference</label><input id="task-booking-reference" className="field-control" name="relatedBookingReference" maxLength={240} defaultValue={task?.related_booking_reference ?? ""} aria-describedby="task-reference-hint" /></div>
        <p id="task-reference-hint" className="field-help field-full">Vendor and booking modules are not connected yet; these are notes or references, not foreign-key links.</p>
      </div>
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      <div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending || hasCycle}>{pending ? "Saving…" : task ? "Save task" : "Create task"}</Button></div>
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
      ? <ul className="task-comments">{task.comments.map((comment) => <li key={comment.id}><span>{comment.body}</span><span className="table-secondary">{comment.author_name} · {new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.created_at))}</span></li>)}</ul>
      : <p className="field-help">No comments yet.</p>}
      {canEdit && <CommentForm weddingId={weddingId} taskId={task.id} />}
    </section>
    <section><h4>Activity history</h4>{task.activity.length
      ? <ul className="task-activity">{task.activity.map((event) => <li key={event.id}><span>{activityLabel(event.event_type)}</span><span className="table-secondary">{event.actor_name} · {new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</span></li>)}</ul>
      : <p className="field-help">No activity has been recorded.</p>}</section>
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
