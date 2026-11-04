"use client";

import { useActionState } from "react";
import { createWeddingAction, updateWeddingSetupAction } from "@/app/actions/weddings";
import { Button, Field, SelectField, TextAreaField } from "@/components/ui";
import type { WeddingSetup } from "@/lib/data/weddings";

type Props = { mode: "create" } | { mode: "edit"; wedding: WeddingSetup };

export function WeddingSetupForm(props: Props) {
  const action = props.mode === "create" ? createWeddingAction : updateWeddingSetupAction;
  const [state, formAction, pending] = useActionState(action, {});
  const wedding = props.mode === "edit" ? props.wedding : undefined;
  const fullFieldClass = props.mode === "edit" ? "field-full" : "";

  return <form action={formAction} className={props.mode === "create" ? "auth-form" : "field-grid"} aria-describedby="wedding-details-hint">
    {wedding && <input type="hidden" name="weddingId" value={wedding.id} />}
    <p className={"field-help " + fullFieldClass} id="wedding-details-hint">
      Wedding dates, times, and schedules use this IANA timezone. Currency is the reporting currency for budget figures.
    </p>
    <Field label="Workspace name" name="name" required maxLength={160} defaultValue={wedding?.name ?? ""} />
    <Field label="Partner one display name" name="partnerOneDisplayName" maxLength={120} defaultValue={wedding?.partner_one_display_name ?? ""} />
    <Field label="Partner two display name" name="partnerTwoDisplayName" maxLength={120} defaultValue={wedding?.partner_two_display_name ?? ""} />
    <Field label="Target or confirmed date" name="weddingDate" type="date" defaultValue={wedding?.wedding_date ?? ""} />
    <SelectField label="Date status" name="weddingDateStatus" defaultValue={wedding?.wedding_date_status ?? "tentative"}>
      <option value="tentative">Target date</option>
      <option value="confirmed">Confirmed date</option>
    </SelectField>
    <Field label="Planning timezone" name="timezone" required maxLength={80} defaultValue={wedding?.timezone ?? "Europe/Dublin"} hint="Use an IANA timezone such as Europe/Dublin." />
    <Field label="Default currency" name="currency" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={wedding?.currency ?? "EUR"} hint="Three-letter code, for example EUR." />
    <TextAreaField label="Main locations (one per line)" name="mainLocations" maxLength={5000} defaultValue={wedding?.main_locations.join("\n") ?? ""} className={fullFieldClass} />
    <Field label="Overall budget" name="overallBudget" type="number" min="0" max="999999999999.99" step="0.01" defaultValue={wedding?.overall_budget == null ? "" : String(wedding.overall_budget)} hint={wedding?.currency ?? "EUR"} />
    <TextAreaField label="Planning notes" name="planningNotes" maxLength={10000} defaultValue={wedding?.planning_notes ?? ""} className={fullFieldClass} />
    {state.error && <p className={"auth-alert " + fullFieldClass} role="alert">{state.error}</p>}
    {state.message && <p className={"auth-success " + fullFieldClass} role="status">{state.message}</p>}
    <div className={"form-actions " + fullFieldClass}>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : props.mode === "create" ? "Create wedding workspace" : "Save wedding details"}</Button>
    </div>
  </form>;
}
