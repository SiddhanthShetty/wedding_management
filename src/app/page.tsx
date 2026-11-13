import { redirect } from "next/navigation";
import { requireCurrentWorkspace } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { instantToLocalDate } from "@/lib/planning/local-time";
import { shouldOpenDayOfFirst } from "@/lib/planning/day-of-first";

/**
 * Where you land after signing in or opening the site: Day-of on a day with a function (for anyone
 * who can see it), Home otherwise. The Home link in the menu always shows Home.
 */
export default async function Landing() {
  const workspace = await requireCurrentWorkspace();
  const owner = workspace.membership.role === "owner" || workspace.membership.role === "co_owner";
  const canSeeDayOf = owner || Boolean(workspace.moduleAccess.logistics);
  if (canSeeDayOf) {
    const today = instantToLocalDate(new Date(), workspace.wedding.timezone);
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("functions").select("function_date,status,archived_at").eq("wedding_id", workspace.wedding.id).eq("function_date", today).limit(5);
    if (shouldOpenDayOfFirst({ functions: data ?? [], today, canSeeDayOf, askedForHome: false })) redirect("/today");
  }
  redirect("/overview");
}
