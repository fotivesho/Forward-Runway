import "server-only";
import webpush from "web-push";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { DB_SCHEMA, SUPABASE_URL } from "../supabase/config";
import { loadSnapshot } from "../data/load";
import { buildDashboard } from "../view/dashboard";
import { formatCents } from "../money";
import { todayInZone } from "../dates";
import type { AppSupabaseClient } from "../supabase/server";

/**
 * The morning number: once a day, to each device that turned it on, "Today's limit: $56" and the
 * one thing worth knowing about the day. Needs VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY) and the service key on the server; off until they're set.
 */
export function pushReady(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL);
}

/** The words of one user's morning note. */
export function morningMessage(m: ReturnType<typeof buildDashboard>, today: string): { title: string; body: string } {
  const cap = m.plan.todayCap;
  const reason = cap.reasons?.[0];
  const plan = m.allEvents.find((v) => v.event.date === today);
  const extra = plan ? `${plan.event.title} today` : reason ?? (m.nextPayday ? `Payday ${m.nextPayday.slice(5).replace("-", "/")}` : "");
  return { title: `Today's limit: ${formatCents(Math.max(0, cap.capCents)).replace(/\.00$/, "")}`, body: extra || "Tap to see your day." };
}

export async function sendMorningNotes(): Promise<{ users: number; sent: number; removed: number }> {
  if (!pushReady()) return { users: 0, sent: 0, removed: 0 };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@runwaytomorrow.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const db = createSupabase(SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: DB_SCHEMA }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth, last_sent_on");
  const byUser = new Map<string, NonNullable<typeof subs>>();
  for (const s of subs ?? []) byUser.set(String(s.user_id), [...(byUser.get(String(s.user_id)) ?? []), s]);
  let sent = 0;
  let removed = 0;
  for (const [userId, list] of byUser) {
    try {
      const snapshot = await loadSnapshot(db as unknown as AppSupabaseClient, userId);
      const today = todayInZone(snapshot.profile.timezone || "America/New_York");
      const due = list.filter((s) => s.last_sent_on !== today);
      if (!due.length) continue;
      const msg = morningMessage(buildDashboard(snapshot, today, 30, new Date()), today);
      for (const s of due) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...msg, url: "/app" }), { TTL: 6 * 3600 });
          await db.from("push_subscriptions").update({ last_sent_on: today }).eq("id", s.id);
          sent++;
        } catch (e) {
          // The device turned notifications off or the subscription expired: forget it.
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await db.from("push_subscriptions").delete().eq("id", s.id);
            removed++;
          }
        }
      }
    } catch {
      // One person's data failing never stops the others.
    }
  }
  return { users: byUser.size, sent, removed };
}
