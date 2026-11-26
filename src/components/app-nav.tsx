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
const MOBILE = ["/app", "/app/spend", "/app/calendar", "/app/what-if", "/app/forecast", "/app/accounts"];
const CENTER = "/app/what-if";

export function AppNav({ base = "/app" }: { base?: "/app" | "/demo" }) {
  const path = usePathname();
  const to = (href: string) => base + href.slice(4);
  const active = (href: string) => (href === "/app" ? path === base : path.startsWith(to(href)));
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

      {/* Phones: a floating dock. The current tab grows into a pill with its name; What if sits raised in the middle. */}
      <nav aria-label="Main" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 lg:hidden">
        <ul className="mx-auto flex max-w-md items-center justify-between rounded-[26px] border border-line/80 bg-surface/85 px-2 py-1.5 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          {LINKS.filter((l) => MOBILE.includes(l.href)).map(({ href, label, Icon }) => {
            const on = active(href);
            if (href === CENTER)
              return (
                <li key={href} className="-mt-7">
                  <Link
                    href={to(href)}
                    aria-label={label}
                    aria-current={on ? "page" : undefined}
                    className={`flex h-14 w-14 flex-col items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_8px_24px_-6px_var(--color-brand)] ring-4 ring-bg transition active:scale-95 ${on ? "scale-105" : ""}`}
                  >
                    <Icon aria-hidden size={22} strokeWidth={2.4} />
                    <span className="text-[9px] font-bold leading-tight">{label}</span>
                  </Link>
                </li>
              );
            return (
              <li key={href}>
                <Link
                  href={to(href)}
                  aria-label={label}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-full transition-all duration-200 ${on ? "bg-brand/15 px-3 text-brand" : "w-11 text-muted hover:text-ink"}`}
                >
                  <Icon aria-hidden size={20} strokeWidth={on ? 2.5 : 2} />
                  {on && <span className="text-xs font-bold">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
