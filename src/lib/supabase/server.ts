import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DB_SCHEMA, supabaseEnv } from "./config";

/** Supabase client bound to the signed-in user's session. All queries run under RLS. */
export async function createClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    db: { schema: DB_SCHEMA },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the middleware refreshes the session instead.
        }
      },
    },
  });
}

/** Returns the verified user (validated with the auth server), or null. */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

/** The Supabase client type used throughout the app (bound to the `app` schema). */
export type AppSupabaseClient = Awaited<ReturnType<typeof createClient>>;
