import type { Snapshot } from "@/lib/data/snapshot";
import type { ISODate } from "@/lib/dates";

export interface ViewProps {
  snapshot: Snapshot;
  today: ISODate;
  nowIso: string;
  user: { id: string; email: string | null };
  /** Public demo: fictional data, read-only. */
  demo?: boolean;
}
