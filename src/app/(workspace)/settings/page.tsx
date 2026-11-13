import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { listWeddingMembers } from "@/lib/data/members";
import { MemberManagement } from "@/components/member-management";
import { AppearanceSettings } from "@/components/appearance-settings";
import { Card, PageHeading } from "@/components/ui";
import { WeddingSetupForm } from "@/components/wedding-setup-form";
import { getWeddingSetup } from "@/lib/data/weddings";
import { needsPartner } from "@/lib/roles";

const TABS = [
  { id: "wedding", label: "Wedding" },
  { id: "people", label: "People" },
  { id: "appearance", label: "Appearance" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const workspace = await requireCurrentWorkspace();
  if (workspace.membership.role !== "owner" && workspace.membership.role !== "co_owner") redirect("/forbidden");
  const tab: Tab = TABS.find((item) => item.id === params.tab)?.id ?? "wedding";
  const [members, wedding] = await Promise.all([
    listWeddingMembers(workspace.wedding.id),
    tab === "wedding" ? getWeddingSetup(workspace.wedding.id) : Promise.resolve(null),
  ]);
  const isOwner = workspace.membership.role === "owner";
  const partnerMissing = isOwner && needsPartner(members);
  return <div className="section-stack">
    <PageHeading eyebrow="Settings" title="Settings" description="Your wedding details, who can help plan, and how the app looks." />
    <nav className="area-tabs settings-tabs" aria-label="Settings sections">
      {TABS.map((item) => <Link key={item.id} href={`/settings?tab=${item.id}`} className="area-tab" aria-current={tab === item.id ? "page" : undefined}>{item.label}{item.id === "people" && partnerMissing && <span className="tab-dot" aria-label="(invite your partner)" />}</Link>)}
    </nav>
    {tab === "wedding" && wedding && <Card title="Your wedding" subtitle="Names, date, place, time zone and budget.">
      <WeddingSetupForm mode="edit" wedding={wedding} />
    </Card>}
    {tab === "people" && <MemberManagement weddingId={workspace.wedding.id} currentUserId={workspace.user.id} members={members} inviterName={workspace.displayName} canAddPartner={isOwner} />}
    {tab === "appearance" && <Card title="Appearance"><AppearanceSettings /></Card>}
    {tab === "wedding" && partnerMissing && <p className="field-help">Planning together? <Link className="text-link" href="/settings?tab=people">Invite your partner</Link>.</p>}
  </div>;
}
