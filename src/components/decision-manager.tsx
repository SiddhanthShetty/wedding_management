"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Plus, Scale } from "lucide-react";
import {
  addDecisionCommentAction, addDecisionOptionAction, createDecisionAction,
  saveDecisionPreferenceAction, updateDecisionAction,
} from "@/app/actions/decisions";
import { Button, Card, EmptyState, NotificationRegion, StageBadge } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import type { WeddingDecision } from "@/lib/data/decisions";

export function DecisionManager({
  weddingId, currentUserId, currentUserName, decisions, canEdit, initialOpenOnly = false,
}: {
  weddingId: string;
  currentUserId: string;
  currentUserName: string;
  decisions: WeddingDecision[];
  canEdit: boolean;
  initialOpenOnly?: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [openOnly, setOpenOnly] = useState(initialOpenOnly);
  const shown = openOnly ? decisions.filter((decision) => decision.status === "open") : decisions;
  const [notice, setNotice] = useState("");
  const created = useCallback((message: string) => {
    setCreateOpen(false);
    setNotice(message);
  }, []);
  return <>
    <Card title="Decision records" subtitle="Partner preferences are recorded per member and never treated as a household response." action={canEdit
      ? <Button onClick={() => setCreateOpen(true)}><Plus size={15} aria-hidden="true" /> Add decision</Button>
      : undefined}>
      {!decisions.length
        ? <EmptyState title="No decisions yet" description={canEdit ? "Record a question and at least two options to start." : "A planning editor can add the first decision."} icon={<Scale size={19} aria-hidden="true" />} />
        : <div className="decision-list">{shown.map((decision) => <DecisionCard key={decision.id} weddingId={weddingId} currentUserId={currentUserId} decision={decision} canEdit={canEdit} />)}</div>}
      {decisions.length > 0 && <div className="filter-group" role="group" aria-label="Filter decisions"><button type="button" className={`chip ${!openOnly ? "is-active" : ""}`} aria-pressed={!openOnly} onClick={() => setOpenOnly(false)}>All decisions</button><button type="button" className={`chip ${openOnly ? "is-active" : ""}`} aria-pressed={openOnly} onClick={() => setOpenOnly(true)}>Awaiting a decision ({decisions.filter((decision) => decision.status === "open").length})</button></div>}
      {!canEdit && <p className="field-help">You have read-only access to planning decisions.</p>}
    </Card>
    <CreateDecisionDialog open={createOpen} weddingId={weddingId} onClose={() => setCreateOpen(false)} onCreated={created} />
    {notice && <NotificationRegion message={notice} onDismiss={() => setNotice("")} />}
    <span className="sr-only">Signed in as {currentUserName}</span>
  </>;
}

function CreateDecisionDialog({ open, weddingId, onClose, onCreated }: { open: boolean; weddingId: string; onClose: () => void; onCreated: (message: string) => void }) {
  const [state, action, pending] = useActionState(createDecisionAction, {});
  useEffect(() => { if (state.savedId) onCreated(state.message ?? "Decision created."); }, [state.savedId, state.message, onCreated]);
  return <Dialog open={open} className="planning-editor-dialog" titleId="create-decision-title" descriptionId="create-decision-description" onClose={onClose}>
    <h2 id="create-decision-title" className="dialog-title">Add a decision</h2>
    <p id="create-decision-description" className="dialog-copy">Add the question and possible options. Options can be added later; existing choices remain in the history.</p>
    <form action={action} className="function-editor-form">
      <input type="hidden" name="weddingId" value={weddingId} />
      <div className="field"><label className="field-label" htmlFor="decision-question">Question</label><textarea id="decision-question" className="field-control" name="question" required maxLength={2000} /></div>
      <div className="field"><label className="field-label" htmlFor="decision-options">Options (one per line)</label><textarea id="decision-options" className="field-control" name="options" required maxLength={10000} aria-describedby="decision-options-hint" /><span id="decision-options-hint" className="field-help">Enter at least two different options.</span></div>
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      <div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create decision"}</Button></div>
    </form>
  </Dialog>;
}

function DecisionCard({ weddingId, currentUserId, decision, canEdit }: { weddingId: string; currentUserId: string; decision: WeddingDecision; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateDecisionAction, {});
  return <article className="decision-card">
    <div className="decision-card-header"><div><p className="eyebrow">Question</p><h3>{decision.question}</h3></div><StageBadge kind="decision" status={decision.status} /></div>
    {decision.status === "decided" && <div className="decision-final">
      <strong>Final choice:</strong> {decision.options.find((option) => option.id === decision.final_option_id)?.label ?? "Recorded option"}
      <span>{decision.decision_date && localDateLabel(decision.decision_date)} · decided by {decision.decision_maker_user_id === currentUserId ? "you" : decision.decision_maker_name ?? "a wedding member"}</span>
      {decision.reason && <p>{decision.reason}</p>}
    </div>}
    <div className="decision-columns">
      <section>
        <h4>Options and preferences</h4>
        <ul className="decision-options">{decision.options.map((option) => {
          const preferences = decision.preferences.filter((preference) => preference.option_id === option.id);
          return <li key={option.id}><strong>{option.label}</strong>
            {preferences.length > 0 && <span className="table-secondary">{preferences.map((preference) => preference.member_name + (preference.preference_note ? ": " + preference.preference_note : "")).join(" · ")}</span>}
          </li>;
        })}</ul>
        {canEdit && <PreferenceForm weddingId={weddingId} decision={decision} currentUserId={currentUserId} />}
        {canEdit && <AddOptionForm weddingId={weddingId} decisionId={decision.id} />}
      </section>
      <section>
        <h4>Decision record</h4>
        <form action={action} className="decision-edit-form">
          <input type="hidden" name="weddingId" value={weddingId} />
          <input type="hidden" name="decisionId" value={decision.id} />
          <input type="hidden" name="version" value={decision.version} />
          <label className="field"><span className="field-label">Question</span><textarea className="field-control" name="question" required maxLength={2000} defaultValue={decision.question} disabled={!canEdit} /></label>
          <label className="field"><span className="field-label">Status</span><select className="field-control" name="status" defaultValue={decision.status} disabled={!canEdit}><option value="open">Open</option><option value="deferred">Deferred</option><option value="decided">Decided</option></select></label>
          <label className="field"><span className="field-label">Final choice</span><select className="field-control" name="finalOptionId" defaultValue={decision.final_option_id ?? ""} disabled={!canEdit}><option value="">Choose when decided</option>{decision.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="field"><span className="field-label">Decision date</span><input className="field-control" type="date" name="decisionDate" defaultValue={decision.decision_date ?? ""} disabled={!canEdit} /></label>
          <label className="field"><span className="field-label">Reason</span><textarea className="field-control" name="reason" maxLength={10000} defaultValue={decision.reason} disabled={!canEdit} /></label>
          {canEdit && <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save decision"}</Button>}
          {state.error && <span className="field-error" role="alert">{state.error}</span>}
          {state.message && <span className="field-help" role="status">{state.message}</span>}
        </form>
      </section>
      <section>
        <h4>Comments and history</h4>
        {decision.comments.length
          ? <ul className="task-comments">{decision.comments.map((comment) => <li key={comment.id}><span>{comment.body}</span><span className="table-secondary">{comment.author_name} · {timestampLabel(comment.created_at)}</span></li>)}</ul>
          : <p className="field-help">No comments yet.</p>}
        {canEdit && <DecisionCommentForm weddingId={weddingId} decisionId={decision.id} />}
        <details className="decision-history"><summary>Activity history · {decision.activity.length}</summary>
          {decision.activity.length
            ? <ul className="task-activity">{decision.activity.map((event) => <li key={event.id}><span>{decisionActivityLabel(event.event_type)}</span><span className="table-secondary">{event.actor_name} · {timestampLabel(event.created_at)}</span></li>)}</ul>
            : <p className="field-help">No changes recorded.</p>}
        </details>
      </section>
    </div>
  </article>;
}

function PreferenceForm({ weddingId, decision, currentUserId }: { weddingId: string; decision: WeddingDecision; currentUserId: string }) {
  const preference = decision.preferences.find((item) => item.member_user_id === currentUserId);
  const [state, action, pending] = useActionState(saveDecisionPreferenceAction, {});
  return <form action={action} className="preference-form">
    <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="decisionId" value={decision.id} />
    <label className="field"><span className="field-label">Your preference</span><select className="field-control" name="optionId" required defaultValue={preference?.option_id ?? ""}><option value="">Choose an option</option>{decision.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <label className="field"><span className="field-label">Preference note</span><input className="field-control" name="note" maxLength={2000} defaultValue={preference?.preference_note ?? ""} /></label>
    <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving…" : "Save my preference"}</Button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
    {state.message && <span className="field-help" role="status">{state.message}</span>}
  </form>;
}

function AddOptionForm({ weddingId, decisionId }: { weddingId: string; decisionId: string }) {
  const [state, action, pending] = useActionState(addDecisionOptionAction, {});
  return <form action={action} className="inline-action-form">
    <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="decisionId" value={decisionId} />
    <label className="sr-only" htmlFor={"decision-option-" + decisionId}>Add another option</label>
    <input id={"decision-option-" + decisionId} className="field-control" name="label" required maxLength={500} placeholder="Add an option" />
    <Button type="submit" variant="quiet" disabled={pending}>{pending ? "Adding…" : "Add option"}</Button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
  </form>;
}

function DecisionCommentForm({ weddingId, decisionId }: { weddingId: string; decisionId: string }) {
  const [state, action, pending] = useActionState(addDecisionCommentAction, {});
  return <form action={action} className="inline-action-form comment-form">
    <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="decisionId" value={decisionId} />
    <label className="sr-only" htmlFor={"decision-comment-" + decisionId}>Add decision comment</label>
    <textarea id={"decision-comment-" + decisionId} className="field-control" name="body" required maxLength={4000} placeholder="Add a comment" />
    <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Posting…" : "Post comment"}</Button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
  </form>;
}

function localDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function timestampLabel(value: string) {
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function decisionActivityLabel(event: string) {
  const labels: Record<string, string> = { decision_created: "Decision created", decision_updated: "Decision updated", preference_changed: "Partner preference changed", comment_added: "Comment added", option_added: "Option added" };
  return labels[event] ?? event;
}
