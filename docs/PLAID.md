# Bank connections (Plaid)

Bank connections are **off** until the server has its keys. With no keys set, nothing about banks
appears anywhere on the site.

## What it does

- **Connect:** "Connect your bank" on the Accounts page opens Plaid Link. You sign in to your bank
  in Plaid's window; the login never reaches this app.
- **Imports:** checking, savings, credit card and loan accounts (investment accounts are skipped);
  balances; card statement balance, due date, minimum and APR (Plaid Liabilities, when the bank
  offers it); up to 180 days of transactions, kept current by `/transactions/sync`.
- **Sync now** refreshes a connection. **Sign in again** appears when the bank asks for it (Link
  update mode). **Disconnect** removes the connection at Plaid and deletes the token; the accounts
  and history stay, as manual accounts.
- **Delete my data / delete my account** disconnect every bank at Plaid first.

## How the numbers stay honest

- The bank's balance is the fact. Every synced transaction is marked as already in that balance
  (`cleared`), so the forecast never subtracts it again. Cash accounts use the *available* balance
  (after pending), cards and loans what's owed.
- Card purchases count as spending once, when you buy. The card payment from checking and the
  matching "payment received" on the card are categorized **Card payment**; moves between your own
  accounts are **Transfer**. Neither is ever counted as spending or in cash flow.
- For a bank-connected account, past bills come from the bank's transactions, not from the
  repeating schedule, so a paid bill isn't counted twice in reports. Future bills still come from
  the schedule.

## Security

- `app.bank_connections` holds only what you may see (bank name, status, last sync). Row-level
  security: own rows only; you can read and delete, not create or edit.
- `app.bank_secrets` holds the access token and sync cursor. No grants to `anon` or
  `authenticated` at all: only the server's service role can read it. The token is also encrypted
  with AES-256-GCM using `PLAID_TOKEN_KEY`, so a database copy alone doesn't expose a usable token.
- Tests: `npm run test:db` (row-level security, including bank tables) and `npm run test:bank`
  (connect, re-sync, disconnect against real migrations through PostgREST and the fake bank).

## Setup

1. **Plaid dashboard:** enable **Transactions** (required) and **Liabilities** (for card statements).
   For production, add `https://runwaytomorrow.com` as an allowed redirect URI if you use OAuth banks,
   and set `PLAID_REDIRECT_URI` to it.
2. **Database:** apply `supabase/migrations/20261127000000_bank_connections.sql` in the Supabase SQL
   editor (or `supabase db push`).
3. **Vercel → Settings → Environment Variables** (server-only, never `NEXT_PUBLIC_`):

   | Name | Value |
   |---|---|
   | `PLAID_ENV` | `sandbox` first, `production` when approved |
   | `PLAID_CLIENT_ID` | from Plaid → Team Settings → Keys |
   | `PLAID_SECRET` | the secret for that environment |
   | `PLAID_TOKEN_KEY` | any random password of 20+ characters, e.g. from a password manager (keep it; changing it means reconnecting banks) |
   | `SUPABASE_SERVICE_ROLE_KEY` | already set (used for account deletion) |

4. Redeploy. The **Bank connections** card appears on Accounts.

## Local development

`PLAID_ENV=mock` uses a built-in fake bank (made-up data, no Plaid account needed). It's refused on
Vercel production even if set by mistake.

## Not built yet

- Webhooks (`SYNC_UPDATES_AVAILABLE`) for instant updates; today it syncs on connect and on "Sync now".
- A daily background sync (Vercel Cron).
- Matching a connected account to one you'd added by hand (archive the manual one for now).
- Suggesting repeating bills and paydays from bank history.
