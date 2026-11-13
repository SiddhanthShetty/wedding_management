"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, MessageCircle, UserRoundPlus } from "lucide-react";
import { addMemberAction, revokeMemberAction, type MemberFormState } from "@/app/actions/members";
import { Button, Card } from "@/components/ui";
import type { AccessLevel, MemberRole, WeddingModule } from "@/lib/auth/access";
import { accessSummary, AREA_NAMES, AREA_ORDER, DEFAULT_ACCESS, needsPartner, PLAIN_ROLES, partnerInviteMessage, roleName, type PlainRole } from "@/lib/roles";

type Member = { id: string; userId: string; displayName: string; role: MemberRole; status: string; moduleAccess: Partial<Record<WeddingModule, AccessLevel>> };

/** Area fields the server expects, all "none": partners don't need them. */
const NO_AREAS = AREA_ORDER.map((area) => <input key={area} type="hidden" name={area} value="none" />);

export function MemberManagement({ weddingId, currentUserId, members, inviterName = "", canAddPartner = false }: {
  /** Only the wedding's owner can add a partner; the database enforces the same rule. */
  canAddPartner?: boolean;
  weddingId: string;
  currentUserId: string;
  members: Member[];
  inviterName?: string;
}) {
  return <div className="section-stack">
    {canAddPartner && needsPartner(members) && <PartnerInvite weddingId={weddingId} inviterName={inviterName} />}
    <Card title="Who can see your wedding" subtitle="Each person has their own sign-in. Changes take effect straight away.">
      <ul className="member-list">{members.map((member) => <li key={member.id} className={member.status === "active" ? "" : "is-inactive"}>
        <span className="avatar" aria-hidden="true">{initials(member.displayName)}</span>
        <span className="member-main"><span className="table-primary">{member.displayName}{member.userId === currentUserId ? " (you)" : ""}</span><span className="table-secondary">{roleName(member.role)} · {accessSummary(member.role, member.moduleAccess)}{member.status === "active" ? "" : " · removed"}</span></span>
        {member.status === "active" && member.userId !== currentUserId && <RemoveMemberForm weddingId={weddingId} userId={member.userId} name={member.displayName} />}
      </li>)}</ul>
    </Card>
    <AddPerson weddingId={weddingId} canAddPartner={canAddPartner} />
  </div>;
}

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]!.toLocaleUpperCase()).join("") || "?";

/**
 * There's no invitation email: you send your partner the sign-up link yourself (copy it or open
 * WhatsApp with a ready message), and add their email here once they've confirmed it.
 */
function PartnerInvite({ weddingId, inviterName }: { weddingId: string; inviterName: string }) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(addMemberAction, {});
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  // The address is only known in the browser; until then the buttons wait.
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const signUpUrl = origin ? `${origin}/sign-up` : "";
  const message = signUpUrl ? partnerInviteMessage(signUpUrl, inviterName || "me") : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); } catch { setCopied(false); }
  };
  return <Card title="Invite your partner" subtitle="So you can both plan from your own phones." className="partner-invite">
    <ol className="partner-steps">
      <li><strong>Send them the sign-up link.</strong> Nothing is sent by the app; you send it yourself.
        <div className="partner-actions">
          <Button type="button" variant="secondary" disabled={!message} onClick={copy}>{copied ? <><Check size={15} aria-hidden="true" /> Copied</> : <><Copy size={15} aria-hidden="true" /> Copy the message</>}</Button>
          <a className={`button button-secondary ${message ? "" : "is-disabled"}`} aria-disabled={!message} href={message ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" /> Open WhatsApp</a>
        </div>
        {signUpUrl && <p className="field-help">The link: {signUpUrl}</p>}
      </li>
      <li><strong>They create their account and confirm their email.</strong> They shouldn&apos;t set up a new wedding.</li>
      <li><strong>Add them here</strong> with the email they used.
        <form action={action} className="partner-add-form">
          <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="role" value="co_owner" />{NO_AREAS}
          <label className="sr-only" htmlFor="partner-email">Your partner&apos;s email</label>
          <input id="partner-email" className="field-control" name="email" type="email" autoComplete="off" required placeholder="Their email address" />
          <Button type="submit" disabled={pending}><UserRoundPlus size={15} aria-hidden="true" /> {pending ? "Adding…" : "Add as partner"}</Button>
        </form>
        {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
        {state.message && <p className="auth-success" role="status">{state.message}</p>}
      </li>
    </ol>
  </Card>;
}

/** Add someone, or change what an existing person can do (same email). */
function AddPerson({ weddingId, canAddPartner }: { weddingId: string; canAddPartner: boolean }) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(addMemberAction, {});
  const [plain, setPlain] = useState<PlainRole>("helper");
  const choice = PLAIN_ROLES.find((item) => item.id === plain)!;
  return <Card title="Add someone or change their access" subtitle="They need their own account with a confirmed email first. To change someone's access, enter their email again.">
    <form action={action} key={plain} className="add-person-form">
      <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="role" value={choice.role} />
      <div className="field"><label className="field-label" htmlFor="member-email">Their email</label><input className="field-control" id="member-email" name="email" type="email" autoComplete="off" required /></div>
      <fieldset className="choice-cards">
        <legend className="field-label">What can they do?</legend>
        {PLAIN_ROLES.filter((item) => canAddPartner || item.id !== "partner").map((item) => <label key={item.id} className={`choice-card ${plain === item.id ? "is-selected" : ""}`}>
          <input type="radio" name="plainRole" value={item.id} checked={plain === item.id} onChange={() => setPlain(item.id)} />
          <strong>{item.name}</strong><span className="row-meta">{item.description}</span>
        </label>)}
      </fieldset>
      {plain === "partner" ? NO_AREAS : <fieldset className="field-grid">
        <legend className="field-label">Which parts?</legend>
        {AREA_ORDER.map((area) => <div className="field" key={area}><label className="field-label" htmlFor={`member-${area}`}>{AREA_NAMES[area]}</label>
          <select className="field-control" id={`member-${area}`} name={area} defaultValue={DEFAULT_ACCESS[plain][area]}>
            <option value="none">Can&apos;t see it</option><option value="read">Can see it</option>{plain === "helper" && <option value="edit">Can change it</option>}
          </select></div>)}
      </fieldset>}
      <p className="field-help">These limits are enforced on the server, not just on this page.</p>
      {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
      {state.message && <p className="auth-success" role="status">{state.message}</p>}
      <div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Saving…" : `Save as ${choice.name.toLowerCase()}`}</Button></div>
    </form>
  </Card>;
}

function RemoveMemberForm({ weddingId, userId, name }: { weddingId: string; userId: string; name: string }) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(revokeMemberAction, {});
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <Button variant="quiet" onClick={() => setConfirming(true)}>Remove</Button>;
  return <form action={action} className="member-remove">
    <input type="hidden" name="weddingId" value={weddingId} />
    <input type="hidden" name="targetUserId" value={userId} />
    <span className="field-help">Remove {name}? They&apos;ll lose access straight away.</span>
    <button className="button button-secondary" type="submit" disabled={pending}>{pending ? "Removing…" : "Yes, remove"}</button>
    <button className="button button-quiet" type="button" onClick={() => setConfirming(false)}>Cancel</button>
    {state.error && <span className="field-error" role="alert">{state.error}</span>}
    {state.message && <span className="field-help" role="status">{state.message}</span>}
  </form>;
}
