import { PlanTabs } from "@/components/plan-tabs";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WhatIf } from "@/components/what-if";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "What if" };
export default function Page() {
  const s = getDemoSession();
  return (
    <>
      <PlanTabs base={"/demo"} />
      <PageHeader title="What if…" subtitle="Thinking about buying something? Enter it here before you buy. You'll see if it fits, what it does to your money, the best day to buy it, and whether debit or credit works better." />
      <WhatIf snapshot={s.snapshot} today={s.today} nowIso={s.nowIso} demo />
    </>
  );
}
