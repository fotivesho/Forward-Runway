import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WhatIf } from "@/components/what-if";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "What if" };

export default async function WhatIfPage() {
  const { snapshot, today, nowIso } = await getAppSession();
  return (
    <>
      <PageHeader title="What if…" subtitle="Try it before you buy. Nothing is saved." />
      <WhatIf snapshot={snapshot} today={today} nowIso={nowIso} />
    </>
  );
}
