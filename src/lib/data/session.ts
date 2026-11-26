import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { todayInZone } from "../dates";
import { getUser } from "../supabase/server";
import { loadSnapshot } from "./load";
import { plaidMode } from "../plaid/config";
import { syncBank } from "../plaid/sync";

/** Connected banks refresh themselves when you open the app and their data is older than this. */
const AUTO_SYNC_AFTER_MS = 12 * 3_600_000;

/** One snapshot load per request, shared by the layout and the page. */
export const getAppSession = cache(async () => {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const now = new Date();
  if (plaidMode() !== "off") {
    // Keep bank data fresh without asking: sync any connection last synced over 12 hours ago (bounded wait).
    const { data: conns } = await supabase.from("bank_connections").select("id, status, last_synced_at");
    const stale = (conns ?? []).filter((c) => c.status === "ok" && (!c.last_synced_at || now.getTime() - Date.parse(String(c.last_synced_at)) > AUTO_SYNC_AFTER_MS));
    if (stale.length) {
      const { data: profile } = await supabase.from("profiles").select("timezone").maybeSingle();
      const today = todayInZone((profile?.timezone as string) || "America/New_York", now);
      const work = Promise.allSettled(stale.map((c) => syncBank(supabase, user.id, String(c.id), today)));
      await Promise.race([work, new Promise((done) => setTimeout(done, 8_000))]);
    }
  }
  const snapshot = await loadSnapshot(supabase);
  return {
    user: { id: user.id, email: user.email ?? null },
    snapshot,
    today: todayInZone(snapshot.profile.timezone, now),
    nowIso: now.toISOString(),
  };
});
