"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Landmark, Settings, Sparkles, Sunrise, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

const LINKS: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/app", label: "Today", Icon: Sunrise },
  { href: "/app/spend", label: "Money", Icon: Wallet },
  { href: "/app/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/app/what-if", label: "What if", Icon: Sparkles },
  { href: "/app/forecast", label: "Forecast", Icon: TrendingUp },
  { href: "/app/accounts", label: "Accounts", Icon: Landmark },
  { href: "/app/settings", label: "Settings", Icon: Settings },
];
const MONEY = [
  { href: "/spend", label: "Month" },
  { href: "/spend/transactions", label: "Activity" },
  { href: "/spend/bills", label: "Bills" },
  { href: "/spend/trends", label: "Trends" },
];
const MOBILE = ["/app", "/app/spend", "/app/calendar", "/app/what-if", "/app/forecast", "/app/accounts"];

export function AppNav({ base = "/app" }: { base?: "/app" | "/demo" }) {
  const path = usePathname();
  const to = (href: string) => base + href.slice(4);
  const active = (href: string) => (href === "/app" ? path === base : path.startsWith(to(href)));
  const inMoney = path.startsWith(`${base}/spend`);
  return (
    <>
      <nav aria-label="Main" className="hidden lg:block">
        <ul className="sticky top-4 space-y-1">
          {LINKS.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={to(href)}
                aria-current={active(href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active(href) ? "bg-brand text-brand-ink shadow-sm" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
              >
                <Icon aria-hidden size={18} strokeWidth={2.2} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Phones: docked to the bottom edge, solid, never blending into the page. In Money, its four
          sections sit as pills just above the tabs. */}
      <nav aria-label="Main" className="dock fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.35)] lg:hidden">
        {inMoney && (
          <ul aria-label="Money" className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
            {MONEY.map((m) => {
              const href = base + m.href;
              const on = m.href === "/spend" ? path === href : path.startsWith(href);
              return (
                <li key={m.href}>
                  <Link href={href} aria-current={on ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${on ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted hover:text-ink"}`}>
                    {m.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <ul className="mx-auto grid max-w-md grid-cols-6 px-1 pb-1.5 pt-1.5">
          {LINKS.filter((l) => MOBILE.includes(l.href)).map(({ href, label, Icon }) => {
            const on = active(href);
            return (
              <li key={href}>
                <Link href={to(href)} aria-current={on ? "page" : undefined} className="group flex flex-col items-center gap-0.5 py-0.5">
                  <span className={`flex h-8 w-12 items-center justify-center rounded-full transition ${on ? "bg-brand/20 text-brand" : "text-faint group-hover:text-ink"}`}>
                    <Icon aria-hidden size={20} strokeWidth={on ? 2.3 : 1.9} />
                  </span>
                  <span className={`text-[10.5px] leading-tight ${on ? "font-bold text-brand" : "text-faint"}`}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
