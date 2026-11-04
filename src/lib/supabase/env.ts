import "server-only";

export function getSupabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url?.startsWith("http") || !publishableKey || publishableKey.startsWith("replace-with-")) return null;
  return { url, publishableKey };
}
