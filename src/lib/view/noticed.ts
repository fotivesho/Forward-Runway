import { addDays, addMonths, daysInMonth, diffDays, endOfMonth, formatShort, parts, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import type { OneTimeTransaction } from "../engine";
import { isRefund, notSpendingTxn } from "../categories";
import type { Snapshot } from "../data/snapshot";
import type { HistBar } from "./history";
import { insights as habitInsights, spendModel } from "./patterns";
import { cleanName } from "./recurring";
import { cashFlow, monthBuckets } from "./spend";

/**
 * "Noticed": the engine that reads your money and tells you the few things worth knowing, ranked
 * by the dollars at stake. Every insight carries its evidence (bars, the charges behind it) and what
 * you can do about it, and remembers what you thought of it, so it can get sharper over time (and
 * later hand an AI a clean, structured picture rather than raw transactions).
 */
export interface Noticed {
  id: string;
  /** What kind of thing it is (for learning which kinds you find useful). */
  kind: "hot" | "creep" | "win" | "unusual" | "spike" | "double" | "net" | "price" | "payday" | "lumpy" | "subs" | "weekday";
  icon: string;
  tone: "good" | "warn" | "info";
  /** A few words. */
  title: string;
  /** The number that matters. */
  stat: string;
  /** One or two plain sentences with the real numbers. */
  detail: string;
  /** Dollars a month at stake: what ranks it. */
  impactCents: Cents;
  category?: string;
  /** A merchant name, to list its charges. */
  merchant?: string;
  /** Evidence: months (or charges), with the average line. */
  bars?: HistBar[];
  avgCents?: Cents;
  /** The charges it's about. */
  txnIds?: string[];
  /** What to do next (paths are relative to /app or /demo). */
  actions: Array<{ label: string; path: string }>;
  /** One tap: set this category's monthly budget (the usual amount, rounded). */
  cap?: { category: string; cents: Cents };
}

const usd = (c: Cents) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Everything you might want to know, most worth it first. Snoozed ones are left out. */
export function noticed(s: Snapshot, today: ISODate, limit = 8): Noticed[] {
  const out: Noticed[] = [];
  const thisMonth = startOfMonth(today);
  const { y, m, d } = parts(today);
  const progress = d / daysInMonth(y, m);
  // Six full months back, then this one.
  const starts = [6, 5, 4, 3, 2, 1, 0].map((k) => addMonths(thisMonth, -k));
  const idx = (date: ISODate) => starts.findIndex((st) => date >= st && date <= endOfMonth(st));
  const spend = s.transactions.filter((t) => t.status === "posted" && !notSpendingTxn(t) && t.date >= starts[0]! && t.date <= today);
  const cat = (t: OneTimeTransaction) => t.category?.trim() || "Uncategorized";
  const by = new Map<string, number[]>();
  for (const t of spend) {
    const i = idx(t.date);
    if (i < 0) continue;
    const sign = t.direction === "out" ? 1 : isRefund(t) ? -1 : 0;
    if (!sign) continue;
    const arr = by.get(cat(t)) ?? new Array(7).fill(0);
    arr[i] += sign * t.amountCents;
    by.set(cat(t), arr);
  }
  const barsFor = (arr: number[], projected?: number): HistBar[] => {
    const first = arr.findIndex((v) => v > 0);
    return starts
      .map((st, i) => ({ st, i }))
      .filter(({ i }) => i >= Math.max(0, first) || i === 6)
      .map(({ st, i }) => {
        const mm = parts(st).m - 1;
        return i === 6
          ? { key: st, label: MON[mm]!, title: `${MONTH[mm]} so far`, cents: projected ?? arr[6]!, doneCents: arr[6]!, kind: "now" as const }
          : { key: st, label: MON[mm]!, title: MONTH[mm]!, cents: Math.max(0, arr[i]!), kind: "past" as const };
      });
  };
  const avgOf = (arr: number[]) => {
    const first = arr.findIndex((v) => v > 0);
    const full = arr.slice(Math.max(0, first), 6);
    return first >= 0 && first < 6 && full.length >= 2 ? full.reduce((a, b) => a + b, 0) / full.length : 0;
  };
  const budget = { label: "Set a budget", path: "/spend/budget" };
  const capAt = (c: string, avg: number) => ({ category: c, cents: Math.max(1_000, Math.round(avg / 1_000) * 1_000) });

  for (const [c, arr] of by) {
    const avg = avgOf(arr);
    if (avg <= 0) continue;
    // Running hot this month: on pace to land well above usual.
    if (d >= 5 && progress < 0.97) {
      const projected = Math.round(arr[6]! / progress);
      if (projected >= avg * 1.3 && projected - avg >= 5_000) {
        out.push({
          id: `hot-${c}-${thisMonth}`, kind: "hot", icon: c, tone: "warn", category: c,
          title: `${c} is running hot`,
          stat: `+${Math.round((projected / avg - 1) * 100)}%`,
          detail: `${usd(arr[6]!)} so far this month. At this pace that's about ${usd(projected)} by the end of ${MONTH[m - 1]}, against your usual ${usd(avg)}.`,
          impactCents: projected - avg, bars: barsFor(arr, projected), avgCents: Math.round(avg), actions: [], cap: capAt(c, avg),
        });
      }
    }
    // Creeping up: three months in a row, each higher.
    const [a, b, last] = [arr[3]!, arr[4]!, arr[5]!];
    if (a > 0 && b >= a * 0.9 && last >= b && last >= a * 1.2 && last - a >= 3_000) {
      out.push({
        id: `creep-${c}-${starts[5]}`, kind: "creep", icon: c, tone: "warn", category: c,
        title: `${c} keeps creeping up`,
        stat: `+${Math.round((last / a - 1) * 100)}%`,
        detail: `${usd(a)} in ${MONTH[parts(starts[3]!).m - 1]}, ${usd(b)} in ${MONTH[parts(starts[4]!).m - 1]}, ${usd(last)} in ${MONTH[parts(starts[5]!).m - 1]}. Small steps up become the new normal if nobody looks.`,
        impactCents: last - a, bars: barsFor(arr), avgCents: Math.round(avg), actions: [], cap: capAt(c, avg),
      });
    }
    // A win: last month well under usual.
    if (last > 0 && last <= avg * 0.75 && avg - last >= 5_000) {
      out.push({
        id: `win-${c}-${starts[5]}`, kind: "win", icon: c, tone: "good", category: c,
        title: `${c} down last month`,
        stat: `−${Math.round((1 - last / avg) * 100)}%`,
        detail: `${usd(last)} in ${MONTH[parts(starts[5]!).m - 1]} against your usual ${usd(avg)}: ${usd(avg - last)} kept. Whatever you did, it worked.`,
        impactCents: avg - last, bars: barsFor(arr), avgCents: Math.round(avg), actions: [],
      });
    }
  }

  // An unusually big charge in the last 30 days, for its category.
  const recentOut = spend.filter((t) => t.direction === "out" && t.date > addDays(today, -30));
  for (const t of recentOut) {
    const peers = spend.filter((x) => x.direction === "out" && cat(x) === cat(t) && x.id !== t.id).map((x) => x.amountCents);
    if (peers.length < 4) continue;
    const med = median(peers);
    if (t.amountCents >= Math.max(10_000, med * 3)) {
      out.push({
        id: `unusual-${t.id}`, kind: "unusual", icon: cat(t), tone: "info", category: cat(t),
        title: `Big one: ${t.description}`,
        stat: usd(t.amountCents),
        detail: `${formatShort(t.date)}, about ${Math.round(t.amountCents / Math.max(1, med))}× a typical ${cat(t)} charge (${usd(med)}). If it was a one-off, work or reimbursed, its category can be set to not counted.`,
        impactCents: Math.round((t.amountCents - med) / 3), txnIds: [t.id], actions: [{ label: "Categories", path: "/settings#categories" }],
      });
    }
  }

  // A merchant you're visiting a lot more than usual this month.
  const merchants = new Map<string, { name: string; now: OneTimeTransaction[]; before: number; beforeCents: number }>();
  for (const t of spend) {
    if (t.direction !== "out") continue;
    const key = cleanName(t.description);
    if (!key) continue;
    const e = merchants.get(key) ?? { name: t.description, now: [], before: 0, beforeCents: 0 };
    if (t.date >= thisMonth) e.now.push(t);
    else if (t.date >= starts[3]!) {
      e.before += 1;
      e.beforeCents += t.amountCents;
    }
    merchants.set(key, e);
  }
  for (const [key, e] of merchants) {
    const usualCount = e.before / 3;
    const nowCents = e.now.reduce((a, t) => a + t.amountCents, 0);
    if (e.now.length >= 4 && e.now.length >= usualCount * 2 && nowCents >= 5_000) {
      out.push({
        id: `spike-${key}-${thisMonth}`, kind: "spike", icon: e.now[0]!.category ?? "spend", tone: "warn", merchant: e.name, category: e.now[0]!.category ?? undefined,
        title: `${e.name}, ${e.now.length} times`,
        stat: usd(nowCents),
        detail: `${e.now.length} charges this month for ${usd(nowCents)}${usualCount >= 0.5 ? `, against about ${Math.round(usualCount)} a month before` : ", more than ever before"}.`,
        impactCents: nowCents - Math.round(e.beforeCents / 3), txnIds: e.now.map((t) => t.id), actions: [],
      });
    }
  }

  // The same charge twice within two days: worth checking it wasn't billed twice.
  const seen = new Set<string>();
  for (const t of recentOut) {
    if (t.amountCents < 500 || seen.has(t.id)) continue;
    const twin = recentOut.find((x) => x.id !== t.id && !seen.has(x.id) && x.amountCents === t.amountCents && cleanName(x.description) === cleanName(t.description) && Math.abs(diffDays(x.date, t.date)) <= 2);
    if (!twin) continue;
    seen.add(t.id).add(twin.id);
    out.push({
      id: `double-${t.id}-${twin.id}`, kind: "double", icon: "card", tone: "warn",
      title: `Charged twice? ${t.description}`,
      stat: usd(t.amountCents),
      detail: `${usd(t.amountCents)} on ${formatShort(twin.date < t.date ? twin.date : t.date)} and again on ${formatShort(twin.date < t.date ? t.date : twin.date)}. If you only bought it once, ask the merchant or your bank to reverse one.`,
      impactCents: t.amountCents, txnIds: [t.id, twin.id], actions: [],
    });
  }

  // Last month, money out beat money in.
  const flow = cashFlow(s, today, monthBuckets(today, 2))[0];
  if (flow && flow.inCents > 0 && flow.outCents - flow.savingsCents > flow.inCents) {
    const gap = flow.outCents - flow.savingsCents - flow.inCents;
    out.push({
      id: `net-${flow.start}`, kind: "net", icon: "cash", tone: "warn",
      title: `${MONTH[parts(flow.start).m - 1]} spent more than it earned`,
      stat: `−${usd(gap)}`,
      detail: `${usd(flow.inCents)} came in and ${usd(flow.outCents - flow.savingsCents)} went out (not counting money moved to savings). The difference came from cash you already had.`,
      impactCents: gap, actions: [{ label: "See the month", path: "/spend" }],
    });
  }

  // Habits from the spending model: payday splurges, big rare costs, subscriptions and their prices.
  const model = spendModel(s, today);
  for (const h of habitInsights(s, today, model)) {
    const kind = h.id.startsWith("lumpy") ? "lumpy" : h.id.startsWith("price") ? "price" : h.id === "subs" ? "subs" : h.id === "payday" ? "payday" : h.id === "weekday" ? "weekday" : null;
    if (!kind) continue;
    const dollars = Number(h.stat.replace(/[^\d.]/g, "")) * 100 || 0;
    const impact = kind === "lumpy" ? dollars / 4 : kind === "price" ? dollars : kind === "subs" ? dollars / 12 / 6 : kind === "payday" ? 3_000 : 500;
    out.push({
      id: h.id, kind, icon: kind === "price" || kind === "subs" ? "Subscriptions" : kind === "lumpy" ? "save" : kind === "payday" ? "income" : "plan",
      tone: h.tone, title: h.title, stat: h.stat, detail: h.detail, impactCents: Math.round(impact),
      actions: kind === "price" || kind === "subs" ? [{ label: "See your bills", path: "/spend/bills" }] : kind === "lumpy" ? [budget] : [],
    });
  }

  // Snoozed ones stay away until their time is up; kinds you've said aren't useful rank lower.
  const snoozed = new Map<string, string>();
  const rating = new Map<string, number>();
  for (const c of s.corrections) {
    if (c.kind !== "preference") continue;
    if (c.matchKey.startsWith("insight_snooze:")) snoozed.set(c.matchKey.slice(15), String((c.value as { until?: string }).until ?? "9999-12-31"));
    if (c.matchKey.startsWith("insight_rating:")) {
      const v = c.value as { kind?: string; useful?: boolean };
      if (v.kind) rating.set(v.kind, (rating.get(v.kind) ?? 0) + (v.useful ? 1 : -1));
    }
  }
  const weight = { warn: 1, info: 0.6, good: 0.55 } as const;
  // One story per category: the strongest one.
  const told = new Set<string>();
  return out
    .filter((n) => !(snoozed.get(n.id) && snoozed.get(n.id)! >= today))
    .map((n) => ({ n, score: n.impactCents * weight[n.tone] * Math.pow(1.4, Math.max(-3, Math.min(3, rating.get(n.kind) ?? 0))) }))
    .sort((a, b) => b.score - a.score)
    .filter(({ n }) => {
      if (!n.category || n.kind === "unusual" || n.kind === "double") return true;
      if (told.has(n.category)) return false;
      told.add(n.category);
      return true;
    })
    .slice(0, limit)
    .map(({ n }) => n);
}
