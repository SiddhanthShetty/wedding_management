"use client";
import { useActionState } from "react";
import type { ReactNode } from "react";
import type { CateringActionState } from "@/app/actions/catering";

export function CateringActionForm({ action, children, label, className = "" }: { action: (state: CateringActionState, form: FormData) => Promise<CateringActionState>; children: ReactNode; label: string; className?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className={className}>{children}<button className="button button-secondary" type="submit" disabled={pending}>{pending ? "Saving…" : label}</button>{state.error&&<p className="field-error" role="alert">{state.error}</p>}{state.message&&<p className="field-success" role="status">{state.message}</p>}</form>;
}
