import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WhatIf } from "@/components/what-if";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "What if" };

export default async function WhatIfPage() {
  const { snapshot, today } = await getAppSession();
  return (
    <>
      <PageHeader title="What if…" subtitle="Test a big purchase or a change to your plan before you commit. Your real data isn't changed." />
      <WhatIf snapshot={snapshot} today={today} />
    </>
  );
}
