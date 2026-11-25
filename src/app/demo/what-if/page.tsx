import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WhatIf } from "@/components/what-if";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "What if" };
export default function Page() {
  const s = getDemoSession();
  return (
    <>
      <PageHeader title="What if…" subtitle="Test a big purchase or a change to your plan before you commit. Your real data isn't changed." />
      <WhatIf snapshot={s.snapshot} today={s.today} nowIso={s.nowIso} demo />
    </>
  );
}
