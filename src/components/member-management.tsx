"use client";

import { useActionState } from "react";
import { addMemberAction, revokeMemberAction, type MemberFormState } from "@/app/actions/members";
import { Button, Card } from "@/components/ui";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";

const moduleLabels: Record<WeddingModule, string> = {
  planning: "Planning",
  suppliers_finance: "Suppliers & finance",
  guests: "Guests",
  logistics: "Logistics",
};

export function MemberManagement({ weddingId, currentUserId, members }: {
  weddingId: string;
  currentUserId: string;
  members: Array<{ id: string; userId: string; displayName: string; role: MemberRole; status: string; moduleAccess: Partial<Record<WeddingModule, AccessLevel>> }>;
}) {
  const [state, formAction, pending] = useActionState<MemberFormState, FormData>(addMemberAction, {});
  return <div className="section-stack">
    <Card title="Wedding members" subtitle="Separate accounts can share one wedding. Membership changes take effect on the next request.">
      <div className="table-scroll"><table className="data-table"><caption className="sr-only">People in this wedding and what they can do</caption><thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Can see and change</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Membership actions</span></th></tr></thead><tbody>
        {members.map((member) => <tr key={member.id}><td><span className="table-primary">{member.displayName}</span></td><td>{member.role.replaceAll("_", " ")}</td><td>{member.role === "owner" || member.role === "co_owner" ? "All modules · edit" : Object.entries(member.moduleAccess).map(([module, level]) => `${moduleLabels[module as WeddingModule]}: ${level}`).join(" · ") || "No modules"}</td><td>{member.status}</td><td>{member.status === "active" && member.userId !== currentUserId && <RevokeMemberForm weddingId={weddingId} userId={member.userId} />}</td></tr>)}
      </tbody></table></div>
    </Card>
    <Card title="Add a verified account" subtitle="No invitation email is sent. The account must already exist and have a verified email.">
      <form action={formAction}>
        <input type="hidden" name="weddingId" value={weddingId} />
        <div className="field-grid"><div className="field"><label className="field-label" htmlFor="member-email">Account email</label><input className="field-control" id="member-email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field"><label className="field-label" htmlFor="member-role">Role</label><select className="field-control" id="member-role" name="role" defaultValue="scoped_collaborator"><option value="owner">Owner (partner)</option><option value="co_owner">Co-owner</option><option value="scoped_collaborator">Scoped collaborator</option><option value="read_only_collaborator">View-only helper</option></select></div>
          {(Object.entries(moduleLabels) as [WeddingModule, string][]).map(([module, label]) => <div className="field" key={module}><label className="field-label" htmlFor={`member-${module}`}>{label} permission</label><select className="field-control" id={`member-${module}`} name={module} defaultValue="none"><option value="none">No access</option><option value="read">Read</option><option value="edit">Edit</option></select></div>)}
        </div>
        <p className="field-help" style={{ marginTop: 10 }}>Partners can see and change everything. View-only helpers can look but not change anything. These limits are enforced on the server, not just on this page.</p>
        {state.error && <p className="auth-alert" role="alert" style={{ marginTop: 12 }}>{state.error}</p>}
        {state.message && <p className="auth-success" role="status" style={{ marginTop: 12 }}>{state.message}</p>}
        <div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Updating membership…" : "Add or update member"}</Button></div>
      </form>
    </Card>
  </div>;
}

function RevokeMemberForm({ weddingId, userId }: { weddingId: string; userId: string }) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(revokeMemberAction, {});
  return <form action={action}>
    <input type="hidden" name="weddingId" value={weddingId} />
    <input type="hidden" name="targetUserId" value={userId} />
    <button className="button button-quiet" type="submit" disabled={pending}>{pending ? "Revoking…" : "Revoke"}</button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
    {state.message && <span className="field-help" role="status">{state.message}</span>}
  </form>;
}
