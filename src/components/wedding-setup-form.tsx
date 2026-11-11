"use client";

import { useActionState, useState } from "react";
import { createWeddingAction, updateWeddingSetupAction } from "@/app/actions/weddings";
import { Button, Field, SelectField, TextAreaField } from "@/components/ui";
import type { WeddingSetup } from "@/lib/data/weddings";
import { currencyOptions, DEFAULT_CURRENCY, DEFAULT_TIMEZONE, timeZoneOptions, workspaceNameFor } from "@/lib/locale";

type Props = { mode: "create" } | { mode: "edit"; wedding: WeddingSetup };

/**
 * First run asks only for your names, the date and the city; time zone and currency default to
 * India (IST) and rupees. Settings shows everything, with rarely changed fields folded away.
 */
export function WeddingSetupForm(props: Props) {
  const action = props.mode === "create" ? createWeddingAction : updateWeddingSetupAction;
  const [state, formAction, pending] = useActionState(action, {});
  const wedding = props.mode === "edit" ? props.wedding : undefined;
  const creating = props.mode === "create";
  const full = creating ? "" : "field-full";
  const [one, setOne] = useState(wedding?.partner_one_display_name ?? "");
  const [two, setTwo] = useState(wedding?.partner_two_display_name ?? "");
  // The wedding's own time zone, not this device's: couples often plan an Indian wedding from abroad.
  const zone = wedding?.timezone ?? DEFAULT_TIMEZONE;
  const currency = wedding?.currency ?? DEFAULT_CURRENCY;

  const timezoneField = <SelectField key={zone} label="Time zone of the wedding" name="timezone" defaultValue={zone} hint="Function times, countdowns and the day-of page use this time zone.">
    {timeZoneOptions(zone).map((option) => <option key={option.id} value={option.id}>{option.label === option.id ? option.id : `${option.label} · ${option.id}`}</option>)}
  </SelectField>;
  const currencyField = <SelectField label="Currency" name="currency" defaultValue={currency}>
    {currencyOptions(currency).map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
  </SelectField>;

  return <form action={formAction} className={creating ? "auth-form" : "field-grid"}>
    {wedding && <input type="hidden" name="weddingId" value={wedding.id} />}
    <Field label="Your name" name="partnerOneDisplayName" maxLength={120} value={one} onChange={(event) => setOne(event.target.value)} autoComplete="given-name" />
    <Field label="Your partner's name" name="partnerTwoDisplayName" maxLength={120} value={two} onChange={(event) => setTwo(event.target.value)} />
    <Field label="Wedding date" name="weddingDate" type="date" defaultValue={wedding?.wedding_date ?? ""} hint="Leave blank if you haven't picked one yet." />
    <label className="checkbox-row"><input type="checkbox" name="dateNotFinal" defaultChecked={wedding ? wedding.wedding_date_status === "tentative" : false} /> <span>The date isn’t final yet</span></label>
    <TextAreaField label={creating ? "City" : "City or places"} name="mainLocations" rows={creating ? 1 : 2} maxLength={5000} defaultValue={wedding?.main_locations.join("\n") ?? ""} placeholder="Mangaluru" hint={creating ? undefined : "One per line, for example the wedding town and the reception town."} className={full} />
    {creating
      ? <details className="more-details"><summary>Wedding not in India?</summary>
          <p className="field-help">Times use India (IST) and money is in rupees (₹) unless you change them here or later in Settings.</p>
          {timezoneField}{currencyField}
        </details>
      : <>{timezoneField}{currencyField}
        <Field label="Overall budget" name="overallBudget" type="number" min="0" max="999999999999.99" step="0.01" defaultValue={wedding?.overall_budget == null ? "" : String(wedding.overall_budget)} hint={`In ${currency}. Optional.`} />
        <details className="more-details field-full"><summary>More details</summary>
          <div className="field-grid">
            <Field label="Name shown at the top" name="name" maxLength={160} defaultValue={wedding?.name ?? ""} placeholder={workspaceNameFor(one, two)} hint="Shown at the top of every page. Leave blank to use your names." />
            <TextAreaField label="Planning notes" name="planningNotes" maxLength={10000} defaultValue={wedding?.planning_notes ?? ""} className="field-full" />
          </div>
        </details></>}
    {creating && <input type="hidden" name="name" value={workspaceNameFor(one, two)} />}
    {state.error && <p className={"auth-alert " + full} role="alert">{state.error}</p>}
    {state.message && <p className={"auth-success " + full} role="status">{state.message}</p>}
    <div className={"form-actions " + full}>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : creating ? "Create our wedding" : "Save wedding details"}</Button>
    </div>
  </form>;
}
