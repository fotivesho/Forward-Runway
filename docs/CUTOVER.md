# Switching runwaytomorrow.com to this version

Goal: replace the live site with this version so users don't notice. Same address, same
logins and passwords, same sign-up and reset emails, and no downtime.

**How:** this version keeps all of its tables in their own `app` schema, so it shares the
existing Supabase project ("Runway") with the current site without touching its tables in
`public`. Both versions run side by side until the domain is switched, and switching back is
one DNS change.

## What stays the same

- **Supabase project:** the same one, so every account, password and session keeps working.
- **Email:** Resend SMTP and the branded templates are unchanged. This version answers the
  existing `/auth/confirm` and `/auth/confirm?next=/reset-password` links.
- **Domain, social accounts, Plaid application:** untouched.

## Steps

1. **Install the schema (safe while the old site is live).** In the "Runway" project, open the
   SQL Editor and run `supabase/migrations/20261125000000_init.sql`, then
   `20261126000000_theme.sql`. They only create the new `app` schema. Nothing in `public`
   changes, and existing users automatically get a profile in the new app.
2. **Expose the schema.** Go to Project Settings → Data API → Exposed schemas and add `app`.
3. **Deploy to Vercel.** Import `fotivesho/Forward-Runway` and set these environment variables:
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | the current project URL (same one the live site uses) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the current publishable key (same one the live site uses) |
   | `NEXT_PUBLIC_SITE_URL` | `https://runwaytomorrow.com` |
   | `SUPABASE_SERVICE_ROLE_KEY` | optional, server-only: enables "Delete my account" |
4. **Allow the test address.** In Supabase Auth → URL Configuration, add the Vercel test
   address's `/auth/callback` and `/auth/confirm` to the Redirect URLs. Keep the existing ones.
5. **Test on the Vercel address with your real login:** sign in, sign out, password reset,
   add an account and a bill, and check the forecast. The live site is unaffected.
6. **Bring your data across.** The current site's data is small (a few accounts, bills and
   transactions), so either re-enter it in onboarding (about 5 minutes) or run a one-time
   copy script. The script needs the old tables' column list first.
7. **Switch the domain.** In Vercel → Domains, add `runwaytomorrow.com` (and `www`). In ChatGPT
   Sites, remove the custom domain. At the registrar, replace the two `A` records
   (`162.159.143.30`, `172.66.3.26`) with the records Vercel shows. **Leave MX and TXT records
   alone** (email and Resend verification). Both sites keep working while DNS updates; anything
   entered on the old site during the switch won't carry over.
8. **Check live:** sign in, reset a password and confirm the email arrives from Resend.

## Rolling back

Point the two `A` records back to `162.159.143.30` and `172.66.3.26`, and re-add the custom
domain in ChatGPT Sites. Its data was never touched. The `app` schema can stay or be removed
later with `drop schema app cascade;` (that deletes only this version's data).

## Not carried over

- Plaid Sandbox tables (`bank_sandbox_*`) stay where they are. Bank connections come in a later
  version, built on your Plaid application.
- The old site's `RUNWAY_SIGNUPS_ENABLED` switch: use Supabase's "Allow new users to sign up"
  setting instead.
