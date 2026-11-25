# Project Fern (working title)

> **Naming:** the app's name is a single setting. It shows as the working title "Project Fern" until you set
> `NEXT_PUBLIC_APP_NAME` (and the ~12-character home-screen label `NEXT_PUBLIC_APP_SHORT_NAME`) at build time,
> e.g. `Runway Tomorrow` / `Runway Tmrw` at launch. No code changes are needed to rename it (see `src/lib/brand.ts`).

A mobile-first personal cash-flow forecasting PWA. It shows what you've spent, what's coming up, and what you can safely spend each day while still paying every bill, paying credit-card statements in full, reducing debt and saving for goals like a wedding.

Version 1.0 has **no bank connections and no AI**. All numbers come from what you enter, import or sync from your calendars.

- **Today and What's Next dashboard**: safe-to-spend today, daily caps until payday, cash forecast chart (30/60/90 days), what's coming up, calendar plans with caps and advice, a balance snapshot with source and freshness, goals, and spending by category.
- **Forecast**: daily opening balance, inflows, outflows and closing balance; lowest balance and its date; cash-floor warnings; assumptions and data freshness; flagged as *incomplete* when balances, card dates or income are missing or stale.
- **Calendars**: any number of iCal feeds (Google, iCloud, Outlook, including shared calendars) or uploaded `.ics` files. Estimated cost and suggested cap per event, likely duplicates detected, corrections remembered for similar events. A missing, failed, stale or suspiciously empty calendar is **never** treated as "no plans".
- **Advice**: for each event, *go ahead within a cap*, *cheaper version*, *postpone* or *skip*, with the effect on cash, card payments, debt interest and savings goals.
- **Big purchases ("savings ammo")**: whether it fits, how much to move from which savings account (protected goals like the wedding fund only with explicit opt-in), when to move it, and 3/6/12-month rebuild plans.
- **What-if scenarios**, **transaction CRUD**, **JSON import/export**, **privacy controls** (hide amounts, wipe data, delete account), **onboarding**, and a **public demo of every page with fictional data** at `/demo`.

## Financial correctness rules

These are enforced by the engine (`src/lib/engine`) and covered by tests.

| Rule | How |
|---|---|
| Money is integer cents | `parseDollars` never uses floats; DB columns are `bigint`; import rejects non-integers. |
| Dates are calendar days | `YYYY-MM-DD` strings with UTC day-number math. No time zones inside the engine; "today" comes from the user's chosen zone. |
| Month-end handling | A monthly item on the 31st lands on Feb 28/29, Apr 30, then back on the 31st. It never drifts. Semi-monthly 30th/31st collapse to one date in February. |
| Card purchases never hit cash twice | Cards and loans are liabilities and can never be spendable, which is enforced in the engine *and* by a DB check constraint. A purchase changes the card balance only. Cash moves only when a statement is paid: an explicit payment you scheduled or, if none, an automatic "pay in full on the due date". Explicit payments within a statement's window reduce the automatic one, so payments are never doubled either. |
| Spending is counted once | Spending reports count card purchases when made and exclude card payments and transfers. |
| Balances have an "as of" date | A balance is the opening balance on that date. Items between that date and today are rolled in and listed as an assumption, unless you mark them *already happened* or *already included in the balance*. |
| Safe to spend never breaks a future bill | The sustainable daily rate is a\* = min over days of (closing − floor) / days elapsed. Each pay period gets the most it can while still leaving a\* for every later day. Tests verify that spending every period's full allowance keeps every day ≥ floor. |
| Facts vs estimates | Every item carries `isEstimate`; projected statements, typical event costs and planned goal contributions are labelled as estimates. Unknown event costs are $0 with a focused question, never invented. |

## Tech

Next.js 15 (App Router, server actions) · TypeScript (strict) · Tailwind CSS v4 · Supabase Postgres + Auth with row-level security · Recharts · Zod · ical.js · Vitest · Playwright.

```
src/lib/engine/      deterministic cash-flow engine (pure, no I/O) + tests
src/lib/calendar/    iCal parsing, cost estimates, duplicate detection, coverage, SSRF-safe fetch, sync
src/lib/data/        DB mapping, validation schemas, import/export, demo data, snapshot loading
src/lib/view/        dashboard view model (shared by the app and the public demo)
src/app/             pages, server actions (src/app/app/actions.ts), auth callback, export route
supabase/migrations/ schema, RLS policies, signup trigger, delete_my_data()
supabase/tests/      RLS test suite (runs against real Postgres)
```

## Security and privacy

- **RLS on every table.** Each policy is `user_id = auth.uid()` for select, insert, update and delete, with `FORCE ROW LEVEL SECURITY`. `anon` has no table grants.
- **Composite foreign keys** `(id, user_id)` stop a row from referencing another user's account, rule or event, even by guessing an ID.
- All queries run with the signed-in user's session. The service-role key is used for exactly one call (deleting your own auth user), only if configured.
- Calendar feed URLs are secrets. They are read only on the server, shown back only as a host name, and excluded from exports. Fetching is https-only with private-network (SSRF) protection rechecked on every redirect, a 10 s timeout and a 5 MB limit.
- The service worker never caches `/app` pages or API responses. `/app/*` responses are sent `Cache-Control: private, no-store`. Security headers include HSTS, `X-Frame-Options: DENY` and `nosniff`.
- The public `/demo` pages render data generated in code (`src/lib/data/demo.ts`); it never queries the database.

## Running locally

Requirements: Node 20+ and a Supabase project (free tier is fine), or the Supabase CLI for a local stack.

```bash
npm install
cp .env.example .env.local        # fill in your Supabase URL and anon key
npm run dev                        # http://localhost:3000  (/demo works without Supabase)
```

Apply the schema to your Supabase project, either:

- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`
- **Dashboard:** SQL Editor → paste and run `supabase/migrations/20261125000000_init.sql`

## Tests

```bash
npm test             # engine, calendar, validation, import/export unit tests (Vitest)
npm run typecheck
npm run test:db      # applies migrations to a throwaway Postgres 15+ and runs the RLS suite
npm run build && npm start &  BASE_URL=http://localhost:3000 npm run test:e2e   # browser smoke test (Playwright)
```

`test:db` needs Postgres binaries (`initdb`, `pg_ctl`, `psql`) on `PATH` or in `/usr/lib/postgresql/*/bin`. It uses a minimal stand-in for Supabase's `auth` schema (`supabase/tests/auth_stub.sql`); never apply that file to a real project.

## Deployment (Vercel + Supabase)

1. **Create a Supabase project.** Note the Project URL, the `anon` key and the `service_role` key (Project Settings → API).
2. **Apply the migration** (see above).
3. **Configure Auth** (Authentication → URL Configuration):
   - Site URL: `https://runwaytomorrow.com`
   - Redirect URLs: `https://runwaytomorrow.com/auth/callback`, `https://runwaytomorrow.com/auth/confirm` and `https://runwaytomorrow.com/auth/confirm?next=/reset-password` (add the same three for your `*.vercel.app` address while testing). `/auth/confirm` and `/auth/callback` are the same handler.
   - Email confirmations: on (recommended). Optionally set a custom SMTP provider for production email volume.
   - The default email links work as-is. For custom templates that use token hashes:
     - Confirm sign-up: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app`
     - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (always lands on `/reset-password`)
   - To keep registration closed, turn off "Allow new users to sign up" under Authentication → Sign In / Providers.
4. **Deploy to Vercel**: import the repository and set these environment variables:
   | Variable | Value | Exposed to browser |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | yes (safe: RLS protects data) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (optional; enables "Delete my account") | **no, server only** |
   | `NEXT_PUBLIC_SITE_URL` | `https://runwaytomorrow.com` | yes |
   | `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_APP_SHORT_NAME` | the app's public name / home-screen label (optional; defaults to the working title) | yes |
5. **Connect the domain** (runwaytomorrow.com): in Vercel → Project → Settings → Domains, add `runwaytomorrow.com` and `www.runwaytomorrow.com`. Vercel shows the DNS records to add at the registrar where you bought the domain (usually an `A` record for the bare domain and a `CNAME` for `www`). HTTPS is issued automatically once DNS resolves.
6. Visit `/login`, create an account and complete onboarding. Install it as an app from the browser menu ("Add to Home Screen").

Any Node host works: `npm run build && npm start` behind HTTPS. Calendar sync needs outbound HTTPS to calendar providers.

## Known limits (v1.0)

- Calendars sync when you open the Calendar page and press *Sync* (or when you connect them); there is no background scheduler yet.
- Times are converted to your profile's time zone; an event that spans midnight counts on its start day.
- Uploaded `.ics` files don't update by themselves.
- Recommendations are deterministic rules, not personalised financial advice.
