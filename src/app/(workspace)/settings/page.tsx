import { redirect } from "next/navigation";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { listWeddingMembers } from "@/lib/data/members";
import { MemberManagement } from "@/components/member-management";
import { signOutAction } from "@/app/actions/auth";
import { Button, Card, PageHeading } from "@/components/ui";
import { WeddingSetupForm } from "@/components/wedding-setup-form";
import { getWeddingSetup } from "@/lib/data/weddings";

export default async function Page() {
  const workspace = await requireCurrentWorkspace();
  if (workspace.membership.role !== "owner" && workspace.membership.role !== "co_owner") redirect("/forbidden");
  const [members, wedding] = await Promise.all([
    listWeddingMembers(workspace.wedding.id),
    getWeddingSetup(workspace.wedding.id),
  ]);
  return <div className="section-stack">
    <PageHeading eyebrow="Workspace" title="Settings" description="Your wedding details and who can help plan." />
    <Card title="Wedding setup" subtitle="Names, date, timezone, locations, budget and planning notes.">
      <WeddingSetupForm mode="edit" wedding={wedding} />
    </Card>
    <MemberManagement weddingId={workspace.wedding.id} currentUserId={workspace.user.id} members={members} />
    <form action={signOutAction} className="form-actions"><Button type="submit" variant="secondary">Sign out</Button></form>
  </div>;
}
