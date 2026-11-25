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
  await page.getByRole("button", { name: /New laptop/ }).click();
  await page.waitForTimeout(300);
  const verdict = await page.locator("[aria-live=polite]").first().innerText();
  check(/\$2,400\.00/.test(verdict) && /(Yes, it fits|Yes, with a plan|Not yet)/.test(verdict) && /(Go ahead|Move \$|Run lean|Skip |Save up|Cut it to)/.test(verdict), "affordability calculator answers the laptop preset with a suggested move");
  await page.fill("#afford-amount", "25");
  await page.waitForTimeout(200);
  check(/Yes, it fits/.test(await page.locator("[aria-live=polite]").first().innerText()), "a small purchase fits");
  await page.getByRole("button", { name: /Weekend trip \$650\.00\?/ }).click();
  await page.waitForTimeout(600);
  check((await page.inputValue("#afford-amount")) === "650", "tapping a hero chip loads that amount into the checker");
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
  check((await page.locator("form fieldset:enabled").count()) === 0, "demo forms are read-only");
  await page.getByRole("button", { name: "60d" }).click();
  check(await page.getByText("In 60 days").isVisible(), "horizon toggle switches to 60 days");
  await page.close();
}

// Every other demo page renders cleanly and stays read-only
for (const path of ["/demo/forecast", "/demo/spend", "/demo/calendar", "/demo/what-if", "/demo/accounts", "/demo/settings", "/demo/onboarding"]) {
  const { page, res, errors } = await visit(path);
  check(res.status() === 200 && errors.length === 0, `${path} loads without errors ${errors.join(" | ")}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${path} has no horizontal scroll at 390px`);
  check((await unlabeled(page)) === 0, `${path} inputs are labelled`);
  check((await page.locator("form fieldset:enabled").count()) === 0, `${path} forms are read-only`);
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

// The checker is also in the app's What-if page, answering in Today's number, with calendar plans as presets
{
  const { page, errors } = await visit("/demo/what-if", 390);
  check(errors.length === 0, `what-if checker loads without errors ${errors.join(" | ")}`);
  const answer = await page.locator("#afford-result").innerText();
  check(/Free to spend/i.test(answer) && /(Yes|Not yet)/.test(answer), "what-if checker answers in pay-period free money");
  await page.getByRole("button", { name: "Credit", exact: true }).click();
  await page.waitForTimeout(300);
  check(/statement ·/i.test(await page.locator("#afford-result").innerText()) && /max/.test(await page.locator("#afford-result").innerText()), "paying by card shows the statement against its cap");
  check((await page.locator("#afford button[aria-pressed]").filter({ hasText: "·" }).count()) > 0, "calendar plans appear as presets with their dates");
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
