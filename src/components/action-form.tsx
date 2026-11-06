"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

export type ActionState = { error?: string; message?: string; at?: number };
type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

/**
 * Server-action form with pending, error and success feedback.
 * Success is only shown when the server action returned a message; failures never show success.
 * With `idempotent`, a `submissionKey` is sent; it stays the same across retries after a failure
 * and is renewed only after a success, so a repeated submission cannot create a second record.
 */
export function ActionForm({ action, children, submitLabel, pendingLabel = "Saving…", className = "", variant = "secondary", resetOnSuccess = false, idempotent = false, ariaLabel }: {
  action: Action; children?: ReactNode; submitLabel: string; pendingLabel?: string; className?: string;
  variant?: "primary" | "secondary" | "quiet"; resetOnSuccess?: boolean; idempotent?: boolean; ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [submissionKey, setSubmissionKey] = useState("");
  useEffect(() => { if (idempotent) setSubmissionKey(newKey()); }, [idempotent]);
  useEffect(() => {
    if (!state.message || state.error) return;
    if (resetOnSuccess) formRef.current?.reset();
    if (idempotent) setSubmissionKey(newKey());
  }, [resetOnSuccess, idempotent, state.message, state.error, state.at]);
  return <form ref={formRef} action={formAction} className={`action-form ${className}`} aria-label={ariaLabel} aria-busy={pending}>
    {idempotent && <input type="hidden" name="submissionKey" value={submissionKey} />}
    {children}
    <div className="action-form-footer">
      <button className={`button button-${variant}`} type="submit" disabled={pending || (idempotent && !submissionKey)}>{pending ? pendingLabel : submitLabel}</button>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {!state.error && state.message && <p className="field-success" role="status">{state.message}</p>}
    </div>
  </form>;
}
