"use server";

import { createClient as createSupabase } from "@supabase/supabase-js";
import { DB_SCHEMA, SUPABASE_URL } from "@/lib/supabase/config";

export type UpdatesState = { ok: boolean; message: string } | null;

/**
 * "Send me a note": adds an email to the updates list. Written with the server's service key, so
 * the list itself is never readable or writable from the browser. Never reveals whether an email
 * was already on it.
 */
export async function joinUpdates(_: UpdatesState, form: FormData): Promise<UpdatesState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (form.get("website")) return { ok: true, message: "You're on the list." }; // bots fill hidden fields
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "That email doesn't look right." };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return { ok: false, message: "Sign-ups open shortly. Try the demo in the meantime." };
  try {
    const db = createSupabase(SUPABASE_URL, key, { db: { schema: DB_SCHEMA }, auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.from("updates_list").insert({ email });
    if (error && error.code !== "23505") {
      if (/updates_list/.test(error.message ?? "")) return { ok: false, message: "Sign-ups open shortly. Try the demo in the meantime." };
      return { ok: false, message: "Couldn't save that just now. Try again in a moment." };
    }
  } catch {
    return { ok: false, message: "Couldn't save that just now. Try again in a moment." };
  }
  return { ok: true, message: "You're on the list. We'll only write when something new lands." };
}
