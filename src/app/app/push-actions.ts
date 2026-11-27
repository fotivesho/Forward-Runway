"use server";

import { getUser } from "@/lib/supabase/server";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Turn the morning note on for this device. */
export async function savePush(sub: Sub): Promise<{ ok: boolean; message?: string }> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, message: "That device didn't give a valid subscription." };
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint: sub.endpoint.slice(0, 1000), p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100) },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, message: /push_subscriptions/.test(error.message ?? "") ? "Morning notes need one database update: run supabase/migrations/20261201000000_push.sql in Supabase." : "Couldn't save that. Try again." };
  return { ok: true };
}

/** Turn it off for this device. */
export async function removePush(endpoint: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false };
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}
