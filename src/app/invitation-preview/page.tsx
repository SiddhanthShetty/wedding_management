import { z } from "zod";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { getInvitationPreview } from "@/lib/data/invitation-preview";
import { SAMPLE_FAMILY } from "@/lib/family-invites/preview";
import { InvitationView } from "@/components/invite/InvitationView";

/**
 * A family's invitation exactly as their link shows it, in preview mode: a banner, hints where
 * lines are missing, and a reply form that is never sent. `?family=<id>` or the sample family.
 */
export default async function InvitationPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await requireCurrentWorkspace("guests");
  const family = z.uuid().safeParse((await searchParams).family);
  const preview = await getInvitationPreview(workspace.wedding.id, family.success ? family.data : SAMPLE_FAMILY);
  // "preview" isn't a valid link code, so even a reply sent by mistake would be refused.
  return <InvitationView code="preview" invitation={preview.invitation} config={preview.config} preview draft={preview.editor.status === "unpublished" || preview.editor.status === "changes"} />;
}
