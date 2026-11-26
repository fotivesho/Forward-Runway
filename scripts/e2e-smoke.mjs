// Browser smoke test for public pages and the fictional demo.
// Usage: start the app (npm run build && npm start), then: BASE_URL=http://localhost:3000 npm run test:e2e
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failures.push(msg);
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function visit(path, width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  return { page, res, errors };
}
async function unlabeled(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((el) => {
      const id = el.id;
      return !(el.getAttribute("aria-label") || (id && document.querySelector(`label[for="${id}"]`)) || el.closest("label"));
    }).length,
  );
}

// Landing
{
  const { page, res, errors } = await visit("/");
  check(res.status() === 200, "landing loads");
  check(errors.length === 0, `landing has no console errors ${errors.join(" | ")}`);
  const h = res.headers();
  check(h["x-frame-options"] === "DENY" && h["x-content-type-options"] === "nosniff", "security headers present");
  await page.close();
}

// Landing page: phone layout and the live "Can I afford it?" calculator
{
  const { page, errors } = await visit("/", 390);
  check(errors.length === 0, `landing has no console errors at 390px ${errors.join(" | ")}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "landing has no horizontal scroll at 390px");
  check((await unlabeled(page)) === 0, "landing inputs are labelled");
  check((await page.getByRole("link", { name: /in the demo →/ }).count()) === 0, "the demo button waits for a first tap");
  await page.getByRole("button", { name: /Laptop/ }).click();
  await page.waitForTimeout(700);
  const verdict = await page.locator("[aria-live=polite]").first().innerText();
  check(/(Yes\. It fits|Yes, with a plan|Not yet)/.test(verdict), "tapping an option answers right in the hero");
  check((await page.getByRole("link", { name: /in the demo →/ }).count()) === 1, "after a tap, one strong path to the demo appears");
  await page.getByRole("button", { name: /Concert/ }).click();
  await page.waitForTimeout(700);
  check(/Yes\. It fits/.test(await page.locator("[aria-live=polite]").first().innerText()), "a small purchase fits");
  await page.close();
}

// Demo (fictional data) at phone and desktop widths
for (const width of [390, 1280]) {
  const { page, res, errors } = await visit("/demo", width);
  check(res.status() === 200, `demo loads at ${width}px`);
  check(errors.length === 0, `demo has no console errors at ${width}px ${errors.join(" | ")}`);
  check(await page.getByText("Safe to spend today").isVisible(), `safe-to-spend card visible at ${width}px`);
  check(await page.getByText("fictional data", { exact: false }).first().isVisible(), "demo is labelled as fictional");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, `no horizontal scroll at ${width}px`);
  check((await unlabeled(page)) === 0, `every demo input has a label at ${width}px`);
  check((await page.locator("form button[type=submit]:enabled").count()) === 0, "demo forms can't save");
  check(/(above|under) your floor/.test(await page.locator("main").innerText()), "today shows the floor takeaway");
  check((await page.getByRole("link", { name: "Can I afford it?" }).count()) > 0, "can I afford it sits in the hero");
  await page.close();
}

// Every other demo page renders cleanly and stays read-only
for (const path of ["/demo/forecast", "/demo/spend", "/demo/spend/patterns", "/demo/calendar", "/demo/what-if", "/demo/accounts", "/demo/settings", "/demo/onboarding"]) {
  const { page, res, errors } = await visit(path);
  check(res.status() === 200 && errors.length === 0, `${path} loads without errors ${errors.join(" | ")}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${path} has no horizontal scroll at 390px`);
  check((await unlabeled(page)) === 0, `${path} inputs are labelled`);
  check((await page.locator("form button[type=submit]:enabled").count()) === 0, `${path} forms can't save`);
  await page.close();
}

// Dark mode: saved choice applied on first paint, switch works and persists, Auto follows the device
{
  const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const host = new URL(BASE).hostname;
  await ctx.addCookies([{ name: "fr-theme", value: "dark", domain: host, path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(BASE + "/demo", { waitUntil: "networkidle" });
  check((await page.getAttribute("html", "data-theme")) === "dark", "saved dark theme is rendered by the server");
  check((await bg(page)) === "rgb(18, 26, 21)", "dark background applied");
  await page.getByRole("radio", { name: "Light theme" }).click();
  check((await page.getAttribute("html", "data-theme")) === "light" && (await bg(page)) === "rgb(246, 241, 228)", "switching to light updates the page");
  check((await ctx.cookies()).some((c) => c.name === "fr-theme" && c.value === "light"), "theme choice is remembered");
  await ctx.close();

  const auto = await browser.newContext({ colorScheme: "dark" });
  const p2 = await auto.newPage();
  await p2.goto(BASE + "/", { waitUntil: "networkidle" });
  check((await p2.getAttribute("html", "data-theme")) === null && (await bg(p2)) === "rgb(18, 26, 21)", "Auto follows a dark device setting");
  await auto.close();
}

// Password reset: no session means a clear "expired" message, and bad links go back to sign-in
{
  const { page } = await visit("/reset-password");
  await page.getByText("This reset link has expired").waitFor({ timeout: 10000 }).catch(() => {});
  check(await page.getByText("This reset link has expired").isVisible(), "reset page without a valid link explains it has expired");
  await page.close();
  const res = await fetch(BASE + "/auth/confirm?token_hash=bad&type=recovery", { redirect: "manual" });
  check(res.status >= 300 && res.status < 400 && /\/login\?mode=reset/.test(res.headers.get("location") ?? ""), "/auth/confirm handles a bad reset link");
}

// ⓘ bubbles open on screen, even inside read-only demo forms, and close with ×
{
  const { page, errors } = await visit("/demo/settings", 390);
  const dot = page.locator(".info-dot").first();
  await dot.scrollIntoViewIfNeeded();
  await dot.click();
  await page.waitForTimeout(350);
  const box = await page.locator(".info-bubble").first().boundingBox();
  check(!!box && box.y >= 0 && box.y + box.height <= 900, "an ⓘ opens a bubble on screen inside a read-only form");
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(300);
  check((await page.locator(".info-bubble").count()) === 0 && errors.length === 0, "the bubble closes with ×");
  await page.close();
}

// From the landing page: the demo opens on Plans with "Add a plan" ready to try
{
  const { page, errors } = await visit("/demo/calendar?add=1", 390);
  await page.waitForTimeout(400);
  check(errors.length === 0 && (await page.getByRole("dialog", { name: "Add a plan" }).isVisible()), "demo plans open with Add a plan ready");
  {
    const dlg = page.getByRole("dialog", { name: "Add a plan" });
    check(/Free to plan with/.test(await dlg.innerText()), "add a plan starts from the paycheck: what's free");
    await dlg.getByRole("button", { name: /^Dining$/ }).click();
    await page.waitForTimeout(300);
    check(/You usually spend/.test(await dlg.innerText()), "picking a category brings in your history for it");
    await dlg.getByRole("button", { name: /^Usual/ }).click();
    await page.waitForTimeout(400);
    check(/(You're good|Doable|Not yet|Already covered)/.test(await dlg.innerText()), "a suggested amount gets an answer before saving");
  }
  await page.goto(BASE + "/demo/forecast", { waitUntil: "networkidle" });
  check(/next bill/i.test(await page.locator("main").innerText()), "forecast shows the next credit card bill");
  await page.goto(BASE + "/demo/spend/patterns", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Day", exact: true }).click();
  check(/on a usual/.test(await page.locator("main").innerText()), "patterns explorer drills into a weekday");
  await page.close();
}

// What if: one question, a plain answer, best time to buy, debit vs credit
{
  {
    const { page, errors } = await visit("/demo/spend/patterns", 390);
    const body = await page.locator("body").innerText();
    check(errors.length === 0 && /Noticed/.test(body) && /Usual spend to/i.test(body) && /Next 30 days/.test(body), "patterns shows insights, pace and the next 30 days");
    await page.close();
  }
  const { page, errors } = await visit("/demo/what-if", 390);
  check(errors.length === 0, `what-if loads without errors ${errors.join(" | ")}`);
  const body = await page.locator("main").innerText();
  check(/Spending money/.test(body) && /Lowest balance/.test(body) && /(You're good|Doable|Not yet|Already covered)/.test(body), "what-if answers in plain words with both meters");
  check(/Best day/i.test(body), "what-if compares dates");
  check(/Debit or credit/i.test(body), "what-if compares debit and credit");
  await page.fill("#wi-amount", "2400");
  await page.waitForTimeout(300);
  check(/(Doable|Not yet)/.test(await page.locator("main").innerText()), "a big amount isn't a plain yes");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "what-if has no horizontal scroll");
  await page.close();
}

// Signed-in area is protected
{
  const { page } = await visit("/app");
  check(/\/login/.test(page.url()), "signed-out visitors are redirected away from /app");
  check((await unlabeled(page)) === 0, "login inputs are labelled");
  await page.close();
}
{
  const res = await fetch(BASE + "/app/export", { redirect: "manual" });
  check(res.status === 307 || res.status === 302 || res.status === 401, "export requires sign-in");
}

// Service worker never caches financial pages
{
  const sw = await (await fetch(BASE + "/sw.js")).text();
  check(!/\/app/.test(sw.split("Privacy rule")[1]?.split("*/")[1] ?? "") , "service worker has no /app caching rule");
  check((await fetch(BASE + "/manifest.webmanifest")).ok, "PWA manifest served");
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll smoke checks passed");
