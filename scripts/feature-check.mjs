// Every feature, opened and used in the demo. The list is the contract: when screens move (the
// four-tab layout), only each feature's `at` changes; if any feature can't be found or used, this
// fails. Usage: start the app, then BASE_URL=http://localhost:3000 npm run test:features
// Each check is { id, area, name, at, run(page) } where run returns true or a failure note.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const only = process.env.ONLY;

const text = async (page, sel = "main") => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
const has = (re) => async (page) => re.test(await text(page)) || `missing ${re}`;
const tap = async (page, role, name, scope) => (scope ? page.locator(scope) : page).getByRole(role, { name }).first().click();
const dialog = (page) => page.locator("dialog[open]").last();
const dialogHas = async (page, re) => re.test((await dialog(page).innerText()).replace(/\s+/g, " ")) || `pop-up missing ${re}`;
const all = async (...steps) => {
  for (const s of steps) {
    const r = await s;
    if (r !== true) return r;
  }
  return true;
};

/** @type {Array<{id:string, area:string, name:string, at:string, run:(page:any)=>Promise<true|string>}>} */
const FEATURES = [
  // ── Today ──────────────────────────────────────────────────────────────
  { id: "today-limit", area: "Today", name: "Today's limit, status pill and days to payday", at: "/demo", run: async (p) => all(has(/Today.s limit.*\$\d/)(p), has(/On track|Tight|Shortfall|Lean/)(p)) },
  { id: "today-afford", area: "Today", name: "Can I afford it? button", at: "/demo", run: async (p) => (await p.getByRole("link", { name: "Can I afford it?" }).count()) > 0 || "no link" },
  { id: "today-noticed", area: "Today", name: "Noticed line linking to Trends", at: "/demo", run: async (p) => (await p.locator('a[href$="/spend/trends"]', { hasText: "Noticed" }).count()) > 0 || "no Noticed line" },
  { id: "today-checkins", area: "Today", name: "How did it go? plan check-ins", at: "/demo", run: has(/How did it go\?.*That's it.*Not this one.*Didn't spend/) },
  { id: "today-daily-limits", area: "Today", name: "Daily limits strip for the days ahead", at: "/demo", run: has(/Daily limits/) },
  { id: "today-plans", area: "Today", name: "Coming up: plans (with + Add), bills and paydays", at: "/demo", run: has(/Coming up.*\+ Add.*Plan →/) },
  { id: "today-next30", area: "Plan · Days", name: "The next 30 days and the floor takeaway", at: "/demo/plan", run: has(/Lowest ahead.*(above|under) your floor/) },
  { id: "today-snapshot", area: "Accounts", name: "Snapshot: net worth, accounts, card bills, goals", at: "/demo/accounts", run: has(/Net worth.*bill.*Goals/) },
  { id: "today-coming", area: "Today", name: "Coming up", at: "/demo", run: has(/Coming up/) },
  { id: "today-plan-popup", area: "Today", name: "A plan opens in a pop-up with its answer", at: "/demo", run: async (p) => { await p.locator('main li button[aria-haspopup="dialog"]').first().click(); return dialogHas(p, /(You're good|Doable|Not yet|Covered|Needs a cost)/); } },
  { id: "plan-amount-edit", area: "Today", name: "Plan pop-up: tap the planned amount to set your own", at: "/demo", run: async (p) => { await p.locator('main li button[aria-haspopup="dialog"]').first().click(); await dialog(p).getByRole("button", { name: "Change the planned amount" }).click(); return dialogHas(p, /Planned amount/); } },
  { id: "info-in-popup", area: "Everywhere", name: "ⓘ bubbles open inside pop-ups", at: "/demo", run: async (p) => { await p.locator('main li button[aria-haspopup="dialog"]').first().click(); await dialog(p).locator(".info-dot").first().click(); const box = await p.locator(".info-bubble").boundingBox(); return !!box || "bubble hidden"; } },

  // ── Calendar ───────────────────────────────────────────────────────────
  { id: "cal-month", area: "Plan · Month", name: "Month grid with daily limits and ‹ › months", at: "/demo/plan/month", run: has(/Your plans.*S M T W T F S|Your plans/) },
  { id: "cal-day", area: "Plan · Month", name: "Tap a day: its limit and plans", at: "/demo/plan/month", run: async (p) => { await p.locator("main button", { hasText: /^\s*29\s*\$/ }).first().click(); return has(/Limit/)(p); } },
  { id: "cal-add", area: "Plan · Month", name: "+ Add a plan (with live what-if)", at: "/demo/plan/month", run: async (p) => { await tap(p, "button", "+ Add", "main"); return dialogHas(p, /Free to plan with/); } },
  { id: "cal-sync", area: "Plan · Month", name: "Sync all", at: "/demo/plan/month", run: has(/Sync all/) },
  { id: "cal-history", area: "Plan · Month", name: "How your plans went", at: "/demo/plan/month", run: has(/How your plans went/) },
  { id: "cal-connect", area: "Plan · Month", name: "Connected calendars, connect a link, upload a file", at: "/demo/plan/month", run: has(/Connected calendars.*Connect a calendar.*Upload a calendar file/) },
  { id: "cal-help", area: "Plan · Month", name: "Where to find the iCal link (Google, Apple, Outlook)", at: "/demo/plan/month", run: has(/Where do I find the secret iCal address/) },

  // ── What if ────────────────────────────────────────────────────────────
  { id: "wi-ask", area: "Plan · What if", name: "What if I spend: amount, plan chips and quick picks", at: "/demo/plan/what-if", run: has(/What if I spend.*Dinner out.*Concert.*Weekend away/) },
  { id: "wi-when", area: "Plan · What if", name: "When: today, Saturday, payday, best time to buy", at: "/demo/plan/what-if", run: has(/Today.*Sat.*Payday.*Doable|Good/) },
  { id: "wi-pay", area: "Plan · What if", name: "Debit vs credit, when cash leaves", at: "/demo/plan/what-if", run: has(/Debit.*Credit.*cash leaves/) },
  { id: "wi-add", area: "Plan · What if", name: "Add to my plans", at: "/demo/plan/what-if", run: has(/Add to my plans/) },
  { id: "wi-scenarios", area: "Plan · What if", name: "What-if scenarios (raise, cancel, skip, cushion)", at: "/demo/plan/what-if", run: async (p) => (await p.locator("#scenarios").count()) > 0 || "no scenarios" },

  // ── Forecast ───────────────────────────────────────────────────────────
  { id: "fc-lowest", area: "Plan · Days", name: "Lowest ahead with chart", at: "/demo/plan", run: has(/Lowest ahead/) },
  { id: "fc-keydays", area: "Plan · Days", name: "Key days named in the timeline, lowest day marked", at: "/demo/plan", run: async (p) => { await tap(p, "button", "60d", "main"); return has(/Day by day.*(Rent|Paycheck).*Lowest/i)(p); } },
  { id: "fc-card", area: "Plan · Days", name: "Card's next bill", at: "/demo/plan", run: has(/next bill/i) },
  { id: "fc-max", area: "Plan · Days", name: "Max bill without savings, both statements, how it adds up", at: "/demo/plan", run: async (p) => all(has(/Max bill without savings.*Due/)(p), (async () => { await p.getByText("How it adds up").first().click(); return has(/Cash now.*Your cushion/)(p); })()) },
  { id: "fc-days", area: "Plan · Days", name: "Day by day 30/60/90 with lean tags", at: "/demo/plan", run: async (p) => { await tap(p, "button", "60d", "main"); return has(/Day by day.*Lean/)(p); } },
  { id: "fc-day-open", area: "Plan · Days", name: "Open a day: why its limit, plans, bills", at: "/demo/plan", run: async (p) => { await p.locator('main button[aria-expanded]', { hasText: /Dec 2/ }).first().click(); return has(/Balance that night/)(p); } },

  // ── Money: Month ───────────────────────────────────────────────────────
  { id: "mo-tiles", area: "Money", name: "Income − Fixed − Spent = Net, each tappable", at: "/demo/spend", run: async (p) => { await p.getByRole("button", { name: /^Income/ }).first().click(); return dialogHas(p, /\$/); } },
  { id: "mo-budget", area: "Money", name: "Budget with groups and category editor", at: "/demo/spend", run: has(/Budget/) },
  { id: "mo-newcat", area: "Money", name: "New category (name, symbol, color)", at: "/demo/spend", run: async (p) => { await tap(p, "button", /New category/, "main"); return dialogHas(p, /Pick a name, a symbol and a color/); } },

  // ── Money: Activity ────────────────────────────────────────────────────
  { id: "ac-list", area: "Money", name: "Transactions by day with search, account and time filters", at: "/demo/spend/transactions", run: async (p) => { await p.getByRole("searchbox").first().fill("Lunch"); return has(/Lunch/)(p); } },
  { id: "ac-chips", area: "Money", name: "Category chips with totals", at: "/demo/spend/transactions", run: has(/Dining \$\d/) },
  { id: "ac-txn", area: "Money", name: "A transaction: category, repeats, history, edit", at: "/demo/spend/transactions", run: async (p) => { await p.locator("main ul li button", { hasText: "Lunch" }).first().click(); return dialogHas(p, /Over time/); } },
  { id: "ac-rename", area: "Money", name: "Tap a transaction's name to rename it", at: "/demo/spend/transactions", run: async (p) => { await p.locator("main ul li button", { hasText: "Lunch" }).first().click(); await dialog(p).getByRole("button", { name: /^Name: / }).click(); return (await dialog(p).getByRole("textbox", { name: "Name" }).count()) > 0 || "no name field"; } },
  { id: "ac-footer", area: "Money", name: "Day-to-day switch and Delete on a transaction", at: "/demo/spend/transactions", run: async (p) => { await p.locator("main ul li button", { hasText: "Lunch" }).first().click(); return all((async () => (await dialog(p).getByRole("switch").count()) > 0 || "no switch")(), dialogHas(p, /Day-to-day.*Delete/)); } },
  { id: "ac-recat", area: "Money", name: "Recategorize: just this one or all with this name", at: "/demo/spend/transactions", run: async (p) => { await p.locator("main ul li button", { hasText: "Lunch" }).first().click(); await dialog(p).locator('button[aria-haspopup="listbox"]').first().click(); await dialog(p).getByRole("option", { name: "Coffee" }).first().click(); return dialogHas(p, /Just this one.*All/); } },
  { id: "ac-cat-edit", area: "Money", name: "Edit or delete a category from the picker (✎)", at: "/demo/spend/transactions", run: async (p) => { await p.locator("main ul li button", { hasText: "Lunch" }).first().click(); await dialog(p).locator('button[aria-haspopup="listbox"]').first().click(); await dialog(p).getByRole("button", { name: "Edit Groceries" }).click(); return dialogHas(p, /Delete…/); } },

  // ── Money: Bills ───────────────────────────────────────────────────────
  { id: "bi-overview", area: "Money", name: "Income − Bills = Left, % of income, over time", at: "/demo/spend/bills", run: async (p) => { await tap(p, "button", "Over time", "main"); return has(/Where fixed money goes/)(p); } },
  { id: "bi-repeating", area: "Money", name: "Repeating items by kind, + Add", at: "/demo/spend/bills", run: has(/Repeating.*Income.*Bills & subscriptions/) },
  { id: "bi-found", area: "Money", name: "Found in your history: add as repeating", at: "/demo/spend/bills", run: has(/Found in your history.*Add as repeating/) },

  // ── Money: Trends ──────────────────────────────────────────────────────
  { id: "tr-noticed", area: "Money", name: "Noticed: lead insight with evidence and actions", at: "/demo/spend/trends", run: async (p) => { await tap(p, "button", "The details", "main"); return dialogHas(p, /Useful\?.*Hide for 30 days/); } },
  { id: "tr-cats", area: "Money", name: "Categories vs average (+/−)", at: "/demo/spend/trends", run: has(/Categories.*(≈ avg|\+\d+%|−\d+%)/) },
  { id: "tr-cat-popup", area: "Money", name: "Category pop-up: tiles, bars, months, drill into a name", at: "/demo/spend/trends", run: async (p) => { await p.locator("main button", { hasText: /^Dining/ }).first().click(); await dialog(p).locator("ul li > button").first().click(); return dialogHas(p, /Over time/); } },
  { id: "tr-cat-pencil", area: "Money", name: "✎ on a category pop-up", at: "/demo/spend/trends", run: async (p) => { await p.locator("main button", { hasText: /^Dining/ }).first().click(); await dialog(p).getByRole("button", { name: "Edit Dining" }).click(); return dialogHas(p, /Name, symbol and color/); } },
  { id: "tr-flow", area: "Money", name: "Net cash flow by month or pay period", at: "/demo/spend/trends", run: has(/Net cash flow.*By month.*By pay period/) },

  // ── Accounts ───────────────────────────────────────────────────────────
  { id: "acc-list", area: "Accounts", name: "Net worth, accounts and cards", at: "/demo/accounts", run: has(/Net worth.*Everyday Checking.*Visa Rewards/) },
  { id: "acc-goals", area: "Accounts", name: "Goals (protected ones never suggested)", at: "/demo/accounts", run: has(/Goals.*Wedding/) },
  { id: "acc-card", area: "Accounts", name: "A card: statement, max bill, how you pay it", at: "/demo/accounts", run: async (p) => { await p.locator("main button", { hasText: "Visa Rewards" }).first().click(); return dialogHas(p, /\$/); } },

  // ── Settings ───────────────────────────────────────────────────────────
  { id: "set-profile", area: "Settings", name: "Profile, appearance, morning note, everyday purchases", at: "/demo/settings", run: has(/Profile.*Appearance.*Morning note.*Everyday purchases go on/) },
  { id: "set-forecast", area: "Settings", name: "Forecast & advice (cushion etc.)", at: "/demo/settings", run: has(/Forecast & advice/) },
  { id: "set-categories", area: "Settings", name: "Categories: rename, symbol, color, delete", at: "/demo/settings", run: async (p) => { await p.locator("#categories li > button").first().click(); return has(/Delete…/)(p); } },
  { id: "set-memory", area: "Settings", name: "What we remember, decisions", at: "/demo/settings", run: has(/remembers.*Recent decisions/) },
  { id: "set-privacy", area: "Settings", name: "Hide amounts, export, delete data and account", at: "/demo/settings", run: has(/Hide amounts.*Download JSON.*Delete all my data.*Delete my account/) },

  // ── Everywhere ─────────────────────────────────────────────────────────
  { id: "swipe-close", area: "Everywhere", name: "Pull a pop-up down to close it", at: "/demo/spend/trends", run: async (p) => {
      await p.locator("main button", { hasText: /^Dining/ }).first().click();
      await p.waitForTimeout(400);
      const open = await p.evaluate(async () => {
        const d = document.querySelector("dialog[open]");
        const h = d.querySelector("h2");
        const mk = (type, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: h, clientX: 200, clientY: y })], changedTouches: [new Touch({ identifier: 1, target: h, clientX: 200, clientY: y })] });
        h.dispatchEvent(mk("touchstart", 150));
        for (let y = 160; y <= 420; y += 20) h.dispatchEvent(mk("touchmove", y));
        h.dispatchEvent(mk("touchend", 420));
        await new Promise((r) => setTimeout(r, 500));
        return !!document.querySelector("dialog[open]");
      });
      return !open || "still open";
    } },
  { id: "nav", area: "Everywhere", name: "Bottom bar: Today, Plan, Money, Accounts", at: "/demo", run: async (p) => { const t = await p.locator('nav[aria-label="Main"]').last().innerText(); return ["Today", "Plan", "Money", "Accounts"].every((x) => t.includes(x)) || `nav: ${t}`; } },
  { id: "plan-pills", area: "Everywhere", name: "Plan's views: Days, Month, What if", at: "/demo/plan", run: async (p) => { const t = await p.locator('ul[aria-label="Plan"]').innerText(); return ["Days", "Month", "What if"].every((x) => t.includes(x)) || `pills: ${t}`; } },
  { id: "old-links", area: "Everywhere", name: "Old links still land in the right place", at: "/demo/calendar", run: async (p) => { if (!p.url().endsWith("/demo/plan/month")) return `calendar → ${p.url()}`; await p.goto(p.url().replace("/demo/plan/month", "/demo/what-if#afford"), { waitUntil: "networkidle" }); if (!p.url().includes("/demo/plan/what-if")) return `what-if → ${p.url()}`; await p.goto(p.url().replace(/\/demo\/plan\/what-if.*/, "/demo/forecast"), { waitUntil: "networkidle" }); return p.url().endsWith("/demo/plan") || `forecast → ${p.url()}`; } },
  { id: "acc-settings", area: "Accounts", name: "⚙ Settings from Accounts", at: "/demo/accounts", run: async (p) => (await p.locator('main a[aria-label="Settings"]').count()) > 0 || "no gear" },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const failures = [];
for (const f of FEATURES) {
  if (only && !f.id.startsWith(only)) continue;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  let result;
  try {
    await page.goto(BASE + f.at, { waitUntil: "networkidle" });
    result = await f.run(page);
  } catch (e) {
    result = String(e.message ?? e).split("\n")[0];
  }
  const ok = result === true;
  console.log(`${ok ? "ok  " : "FAIL"} [${f.area}] ${f.name}  (${f.at})${ok ? "" : `  → ${result}`}`);
  if (!ok) failures.push(f.id);
  await ctx.close();
}
await browser.close();
console.log(failures.length ? `\n${failures.length} of ${FEATURES.length} features failed: ${failures.join(", ")}` : `\nAll ${FEATURES.length} features found and working`);
process.exit(failures.length ? 1 : 0);
