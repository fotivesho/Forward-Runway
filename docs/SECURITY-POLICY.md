# Information Security Policy (draft)

**Owner:** Runway Tomorrow · **Applies to:** the Runway Tomorrow web app, its database and hosting ·
**Review:** at least once a year and after any security incident.

This is a draft for the Plaid Compliance Center. Review and adjust anything that doesn't match how
you actually operate before submitting it; a policy that overstates controls is worse than none.

## 1. Data we hold

Account balances, card statement details, transactions and plans that users enter or connect.
Bank data arrives through Plaid, read-only (the app cannot move money). We don't collect bank
login credentials: users sign in to their bank inside Plaid Link.

## 2. Access control

- Every financial table enforces Postgres row-level security: a user can only read or change their own rows.
- Bank access tokens live in a separate table with no access for signed-in users at all; only the
  server can read it. Tokens are also encrypted (AES-256-GCM) with a key held only in the server's
  environment.
- Administrative access (Supabase, Vercel, GitHub, Plaid, domain registrar, email provider) is
  limited to the owner, with **multi-factor authentication required on every one of these accounts**.
- Production secrets live only in the hosting provider's encrypted environment settings, never in
  source code or chat.

## 3. Encryption

- In transit: HTTPS everywhere (HSTS enabled).
- At rest: database and backups encrypted by the provider (Supabase/AWS); bank tokens additionally
  encrypted by the application.

## 4. Secure development

- Code changes go through version control (GitHub). Automated checks run before each deploy:
  type checking, unit tests, row-level security tests and an end-to-end smoke test.
- Dependencies are updated regularly and reviewed for known vulnerabilities.
- Public pages use only made-up demo data; real data is never shown on public pages.

## 5. Data retention and deletion

- Users can export all their data, wipe it, or delete their account at any time from Settings.
- Deleting data or the account also removes every bank connection at Plaid.
- Disconnecting a bank deletes its access token immediately.

## 6. Logging and monitoring

- Hosting and database logs are kept by the providers. Bank tokens and full calendar addresses are
  never logged or shown back to users.

## 7. Incident response

1. Contain: revoke affected keys (rotate Plaid secret, `PLAID_TOKEN_KEY`, Supabase keys), disable
   bank connections by unsetting `PLAID_ENV` if needed.
2. Assess what data and which users were affected.
3. Notify affected users and Plaid promptly, and regulators where required by law.
4. Fix the cause, then record what happened and what changed.

## 8. Vendors

Supabase (database and auth), Vercel (hosting), Plaid (bank connections), Resend (email). Each is
chosen for its security certifications (SOC 2) and reviewed when the service changes.
