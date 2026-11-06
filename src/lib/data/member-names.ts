import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MemberName = { userId: string; role: string; name: string };

/** Active members of a wedding with display names. Callers must authorize the wedding first. */
export async function listActiveMemberNames(weddingId: string): Promise<MemberName[]> {
  const supabase = await createSupabaseServerClient();
  const { data: members, error } = await supabase.from("wedding_members")
    .select("user_id, role").eq("wedding_id", weddingId).eq("status", "active").order("created_at");
  if (error) throw new Error("Could not load wedding members.");
  const ids = [...new Set((members ?? []).map((member) => member.user_id))];
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [], error: null };
  if (profileError) throw new Error("Could not load member names.");
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name || "Wedding member"]));
  return (members ?? []).map((member) => ({ userId: member.user_id, role: member.role, name: names.get(member.user_id) ?? "Wedding member" }));
}
