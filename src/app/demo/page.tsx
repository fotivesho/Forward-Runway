import { Dashboard } from "@/components/dashboard";
import { getDemoSession } from "@/lib/data/demo-session";

export default function DemoToday() {
  const s = getDemoSession();
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Today and what's next</h1>
      <Dashboard snapshot={s.snapshot} today={s.today} nowIso={s.nowIso} demo />
    </>
  );
}
