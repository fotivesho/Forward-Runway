"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Money's sub-tabs: Month · Activity · Bills · Trends. */
export function MoneyTabs({ base }: { base: "/app" | "/demo" }) {
  const path = usePathname();
  const tabs = [
    { href: `${base}/spend`, label: "Month" },
    { href: `${base}/spend/transactions`, label: "Activity" },
    { href: `${base}/spend/bills`, label: "Bills" },
    { href: `${base}/spend/trends`, label: "Trends" },
  ];
  return (
    <nav aria-label="Money" className="mb-4 hidden rounded-xl border border-line bg-surface p-1 lg:flex">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 flex-auto items-center justify-center whitespace-nowrap rounded-lg px-1.5 text-[13px] font-medium sm:text-sm transition ${active ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
