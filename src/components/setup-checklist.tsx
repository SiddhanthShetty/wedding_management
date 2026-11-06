import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/ui";
import { FUNCTION_SETS, setupSteps, type SetupCounts } from "@/lib/planning/starter-templates";
import { applyFunctionSetAction, applyTaskChecklistAction } from "@/app/actions/setup";

/** Setup progress shown on the Overview until every step the member can see is done. */
export function SetupChecklist({ weddingId, state }: { weddingId: string; state: { counts: SetupCounts; isOwner: boolean; weddingDate: string | null; canAddFunctions: boolean; canAddTasks: boolean } }) {
  const steps = setupSteps(state.counts, state.isOwner);
  const done = steps.filter((step) => step.done).length;
  if (!steps.length || done === steps.length) return null;
  const percent = Math.round((done / steps.length) * 100);
  return <Card title="Set up your wedding" subtitle={`${done} of ${steps.length} done`} className="setup-card">
    <div className="setup-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress"><span style={{ width: `${percent}%` }} /></div>
    <ol className="setup-steps">{steps.map((step) => <li key={step.id} className={step.done ? "is-done" : ""}>
      <span className="setup-mark" aria-hidden="true">{step.done ? "✓" : ""}</span>
      <span><Link className="text-link" href={step.href}>{step.label}</Link>{step.done ? <span className="sr-only"> (done)</span> : <span className="row-meta">{step.hint}</span>}</span>
    </li>)}</ol>
    {(state.canAddFunctions && state.counts.functions === 0) || (state.canAddTasks && state.counts.tasks === 0) ? <div className="setup-templates">
      <h3 className="guest-subheading">Start from a template</h3>
      {!state.weddingDate && <p className="field-help">Tip: set your wedding date in Settings first, so functions and task due dates are filled in for you.</p>}
      {state.canAddFunctions && state.counts.functions === 0 && FUNCTION_SETS.map((set) => <ActionForm key={set.id} action={applyFunctionSetAction} submitLabel={`Add “${set.name}” functions`} className="inline-action-form">
        <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="setId" value={set.id} />
        <span className="row-meta">{set.description}</span>
      </ActionForm>)}
      {state.canAddTasks && state.counts.tasks === 0 && <ActionForm action={applyTaskChecklistAction} submitLabel="Add the starter task checklist" className="inline-action-form">
        <input type="hidden" name="weddingId" value={weddingId} />
        <span className="row-meta">14 common tasks, from budget and venue to final counts, due on a timeline before the wedding.</span>
      </ActionForm>}
    </div> : null}
  </Card>;
}
