import { Dashboard } from "@/components/dashboard";
import { getDemoSession } from "@/lib/data/demo-session";

export default function DemoToday() {
  const s = getDemoSession();
  return (
    <>
      <h1 className="mb-4 font-display text-3xl leading-tight text-display">Today</h1>
      <Dashboard snapshot={s.snapshot} today={s.today} nowIso={s.nowIso} demo />
    </>
  );
}
