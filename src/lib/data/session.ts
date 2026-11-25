import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { todayInZone } from "../dates";
import { getUser } from "../supabase/server";
import { loadSnapshot } from "./load";

/** One snapshot load per request, shared by the layout and the page. */
export const getAppSession = cache(async () => {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const snapshot = await loadSnapshot(supabase);
  const now = new Date();
  return {
    user: { id: user.id, email: user.email ?? null },
    snapshot,
    today: todayInZone(snapshot.profile.timezone, now),
    nowIso: now.toISOString(),
  };
});
