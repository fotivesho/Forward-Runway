/** All of this app's tables live in their own schema so it can share a project with an earlier app. */
export const DB_SCHEMA = "app";

/** Public Supabase key: the classic "anon" key or the newer "publishable" key both work. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function supabaseEnv(): { url: string; anonKey: string } | null {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return null;
  return { url: SUPABASE_URL, anonKey: SUPABASE_PUBLIC_KEY };
}

export const isSupabaseConfigured = () => supabaseEnv() !== null;
