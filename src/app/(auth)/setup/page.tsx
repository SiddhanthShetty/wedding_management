import { redirect } from "next/navigation";
import { WeddingSetupForm } from "@/components/wedding-setup-form";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export default async function SetupPage() {
  const { user, supabase } = await requireAuthenticatedUser();
  const { data: memberships, error } = await supabase.from("wedding_members").select("wedding_id").eq("user_id", user.id).eq("status", "active").limit(1);
  if (error) throw new Error("Could not check existing wedding memberships.");
  if (memberships?.length) redirect("/overview");
  return <><p className="auth-eyebrow">First step</p><h1 className="auth-title">Tell us about your wedding</h1><p className="auth-copy">You can invite your partner and family afterwards. If your partner has already set up your wedding, sign out instead and ask them to add your email in Settings.</p><WeddingSetupForm mode="create" /><form action={signOutAction} className="form-actions"><Button type="submit" variant="secondary">Sign out</Button></form></>;
}
