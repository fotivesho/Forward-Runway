import { PlanTabs } from "@/components/plan-tabs";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WhatIf } from "@/components/what-if";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "What if" };

export default async function WhatIfPage() {
  const { snapshot, today, nowIso } = await getAppSession();
  return (
    <>
      <PlanTabs base={"/app"} />
      <PageHeader title="What if…" subtitle="Thinking about buying something? Enter it here before you buy. You'll see if it fits, what it does to your money, the best day to buy it, and whether debit or credit works better." />
      <WhatIf snapshot={snapshot} today={today} nowIso={nowIso} />
    </>
  );
}
