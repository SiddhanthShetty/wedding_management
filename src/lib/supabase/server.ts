import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export async function createSupabaseServerClient() {
  const env = getSupabaseEnvironment();
  if (!env) throw new Error("Supabase is not configured. Copy local values from `npx supabase status` into `.env.local`.");

  const cookieStore = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. src/proxy.ts handles refresh writes.
        }
      },
    },
  });
}
