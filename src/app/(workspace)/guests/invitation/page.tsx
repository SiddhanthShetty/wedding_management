import { z } from "zod";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getInvitationPreview } from "@/lib/data/invitation-preview";
import { SAMPLE_FAMILY } from "@/lib/family-invites/preview";
import { PageHeading } from "@/components/ui";
import { InvitationPreviewPanel } from "@/components/invitation-preview";

export default async function GuestInvitationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("guests");
  const family = z.uuid().safeParse((await searchParams).family);
  const preview = await getInvitationPreview(workspace.wedding.id, family.success ? family.data : SAMPLE_FAMILY);
  return <>
    <PageHeading title="Invitation" description="What each family sees when they open their link." />
    <InvitationPreviewPanel families={preview.families} selected={preview.selected} checklist={preview.checklist} canSeeFunctions={preview.canSeeFunctions} eventCount={preview.invitation.functions.length} />
  </>;
}
