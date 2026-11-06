"use client";
import { ActionForm } from "@/components/action-form";
import { Select } from "@/components/form-fields";
import { Card } from "@/components/ui";
import { inviteHouseholdAction } from "@/app/actions/bulk";

/** Invite every person in one household to several functions at once. */
export function HouseholdInviteForm({ weddingId, households, functions }: { weddingId: string; households: Array<{ id: string; name: string }>; functions: Array<{ id: string; name: string; function_date: string | null }> }) {
  if (!households.length || !functions.length) return null;
  return <Card title="Invite a whole household" subtitle="Adds an invitation for every person in the household to each function you tick. Existing invitations and plus-one settings stay as they are.">
    <ActionForm action={inviteHouseholdAction} submitLabel="Invite household" className="field-grid">
      <input type="hidden" name="weddingId" value={weddingId} />
      <Select label="Household" name="householdId" required defaultValue=""><option value="" disabled>Choose a household</option>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</Select>
      <fieldset className="check-list field-full">
        <legend className="field-label">Functions</legend>
        {functions.map((fn) => <label key={fn.id} className="check-row"><input type="checkbox" name="functionIds" value={fn.id} /> {fn.name}{fn.function_date ? <span className="row-meta"> · {fn.function_date}</span> : null}</label>)}
      </fieldset>
    </ActionForm>
  </Card>;
}
