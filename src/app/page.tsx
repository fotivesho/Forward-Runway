import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { APP_NAME } from "@/lib/brand";

export default async function Landing({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold">
          <img src="/icon.svg" alt="" width={32} height={32} /> {APP_NAME}
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn btn-secondary btn-sm">Sign in</Link>
        </div>
      </header>
      {deleted && (
        <p role="status" className="mt-6 rounded-xl border border-brand/40 bg-brand/5 p-3 text-sm">Your account and all of its data have been deleted.</p>
      )}
      <section className="mt-14 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Know what you can safely spend today.</h1>
        <p className="mt-4 text-lg text-muted">
          {APP_NAME} forecasts your cash day by day — paydays, bills, card statements, savings transfers — and turns what's left into
          realistic daily caps that keep every bill paid, every card statement paid in full, and your savings goals on track.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login?mode=signup" className="btn btn-primary">Create your runway</Link>
          <Link href="/demo" className="btn btn-secondary">Try the demo (fictional data)</Link>
        </div>
      </section>
      <section className="mt-16 grid gap-4 sm:grid-cols-3" aria-label="Features">
        {[
          ["Daily cash forecast", "Opening balance, money in, money out and closing balance for every day of the next 30, 60 or 90 days, with your lowest point flagged."],
          ["Cards counted once", "Card purchases change your card balance, not your cash. Only the statement payment leaves checking — so nothing is ever double-counted."],
          ["Plans, not guesses", "Connect your calendars and get a cap for each plan. Missing or failed calendars are flagged, never treated as \"no plans\"."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5">
            <h2 className="font-semibold">{t}</h2>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
      <footer className="mt-auto pt-16 text-xs text-faint">
        No bank connections. No AI. Your data is private to your account. <Link href="/privacy" className="underline">Privacy</Link>
      </footer>
    </main>
  );
}
