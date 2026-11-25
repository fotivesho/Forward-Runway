import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { getAppSession } from "@/lib/data/session";

export default async function TodayPage() {
  const { snapshot, today, nowIso } = await getAppSession();
  if (!snapshot.profile.onboardedAt && snapshot.accounts.length === 0) redirect("/app/onboarding");
  const name = snapshot.profile.displayName;
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">
        Today and what's next{name ? <span className="text-muted">, {name}</span> : null}
      </h1>
      <Dashboard snapshot={snapshot} today={today} nowIso={nowIso} />
    </>
  );
}
