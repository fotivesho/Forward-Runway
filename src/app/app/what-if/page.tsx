import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WhatIf } from "@/components/what-if";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "What if" };

export default async function WhatIfPage() {
  const { snapshot, today, nowIso } = await getAppSession();
  return (
    <>
      <PageHeader title="What if…" subtitle="Before you buy, see if it fits, when, and how." />
      <WhatIf snapshot={snapshot} today={today} nowIso={nowIso} />
    </>
  );
}
