import { todayInZone } from "../dates";
import { demoSnapshot } from "./demo";

/** Fictional session for the public demo. Never touches the database. */
export function getDemoSession() {
  const now = new Date();
  const today = todayInZone("America/New_York", now);
  return {
    snapshot: demoSnapshot(today, now.toISOString()),
    today,
    nowIso: now.toISOString(),
    user: { id: "demo", email: null },
    demo: true as const,
  };
}
