import "server-only";

import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { configFromSettings, sameSettings, settingsFromConfig, settingsSchema, type InvitationSettings } from "@/lib/invitation/settings";

/** A rule the couple can act on (shown as written). */
export class InvitationSettingsError extends Error { constructor(message: string) { super(message); this.name = "InvitationSettingsError"; } }

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const isEditor = (role: string) => role === "owner" || role === "co_owner";

function check(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "42501") throw new AuthorizationDeniedError();
  if ((error.code === "40001" || error.code === "22023") && error.message) throw new InvitationSettingsError(error.message);
  throw new Error(fallback);
}

/** The stored draft, read back through the same checks; unreadable wording falls back to the code file. */
const readSettings = (value: unknown): InvitationSettings => { const parsed = settingsSchema.safeParse(value); return parsed.success ? parsed.data : settingsFromConfig(); };

export type EditorState = {
  canEdit: boolean;
  /** What the form and the preview show. */
  draft: InvitationSettings;
  /** Pass back when saving or publishing, so a partner's newer save isn't overwritten. Null before the first save. */
  draftUpdatedAt: string | null;
  status: "original" | "unpublished" | "changes" | "published";
  publishedVersion: number;
  publishedAt: string | null;
  history: Array<{ version: number; publishedAt: string }>;
};

/** The invitation wording for Guests → Invitation. Anyone who can see the guest list can read it; only owners and co-owners edit. */
export async function loadInvitationEditor(supabase: Supabase, weddingId: string, role: string): Promise<EditorState> {
  const [row, history] = await Promise.all([
    supabase.from("invitation_settings").select("draft,draft_updated_at,published,published_version,published_at").eq("wedding_id", weddingId).maybeSingle(),
    supabase.from("invitation_settings_history").select("version,published_at").eq("wedding_id", weddingId).order("version", { ascending: false }).limit(20),
  ]);
  check(row.error, "Could not load the invitation wording.");
  check(history.error, "Could not load the invitation wording.");
  const data = row.data;
  const status: EditorState["status"] = !data ? "original" : !data.published ? "unpublished" : sameSettings(data.draft, data.published) ? "published" : "changes";
  return {
    canEdit: isEditor(role), draft: data ? readSettings(data.draft) : settingsFromConfig(), draftUpdatedAt: (data?.draft_updated_at as string | undefined) ?? null, status,
    publishedVersion: Number(data?.published_version ?? 0), publishedAt: (data?.published_at as string | null | undefined) ?? null,
    history: (history.data ?? []).map((item) => ({ version: Number(item.version), publishedAt: String(item.published_at) })),
  };
}

/** The draft as the invitation components read it. */
export const draftConfig = (state: EditorState) => configFromSettings(state.draft);

async function editor(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId);
  if (!isEditor(context.membership.role)) throw new AuthorizationDeniedError();
  return createSupabaseServerClient();
}

/** Saves the draft (families don't see it). Refused if someone else saved since `base`. */
export async function saveInvitationDraft(weddingId: string, settings: InvitationSettings, base: string | null) {
  const supabase = await editor(weddingId);
  const { data, error } = await supabase.rpc("save_invitation_draft", { p_wedding_id: weddingId, p_draft: settings, p_base: base });
  check(error, "Couldn't save the draft. Nothing was changed; try again.");
  return String(data);
}

/** Families see the draft from now on. Returns the new version number. */
export async function publishInvitation(weddingId: string, base: string | null) {
  const supabase = await editor(weddingId);
  const { data, error } = await supabase.rpc("publish_invitation", { p_wedding_id: weddingId, p_base: base });
  check(error, "Couldn't publish. Families still see the earlier wording; try again.");
  return Number(data);
}

export async function discardInvitationDraft(weddingId: string) {
  const supabase = await editor(weddingId);
  const { error } = await supabase.rpc("discard_invitation_draft", { p_wedding_id: weddingId });
  check(error, "Couldn't discard the draft. Nothing was changed; try again.");
}

/** Puts an earlier published version into the draft, to check and publish again. */
export async function restoreInvitationVersion(weddingId: string, version: number) {
  const supabase = await editor(weddingId);
  const { error } = await supabase.rpc("restore_invitation_version", { p_wedding_id: weddingId, p_version: version });
  check(error, "Couldn't restore that version. Nothing was changed; try again.");
}
