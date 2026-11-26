import Link from "next/link";
import type { Metadata } from "next";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="text-brand underline">← {APP_NAME}</Link>
      <h1 className="font-display mt-4 text-4xl leading-tight text-display">Privacy</h1>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
        <li>Your financial data is stored in a Postgres database with row-level security: every row belongs to your account, and the database itself refuses to show or change it for anyone else.</li>
        <li>Connecting a bank is optional. If you do, it goes through Plaid: you sign in to your bank in Plaid's window, and your bank login never reaches this app. The app receives your balances, card statement details and transactions (read-only; it can't move money). The bank access key is encrypted and kept in a part of the database only the server can read. Disconnecting, wiping your data or deleting your account also removes the connection at Plaid. Plaid's own privacy policy is at <a className="text-brand underline" href="https://plaid.com/legal/#end-user-privacy-policy" rel="noopener noreferrer" target="_blank">plaid.com/legal</a>.</li>
        <li>No AI services, no ads, and your data is never sold. Apart from Plaid (only if you connect a bank), nothing you enter is sent to third parties.</li>
        <li>Calendar addresses you connect are secret links. They're read only by the server to sync, never shown back in full, and never included in exports.</li>
        <li>Financial pages are never cached by the app's offline support or shared caches.</li>
        <li>The public demo uses only made-up data generated in code.</li>
        <li>You can export everything as JSON, wipe all your data, or delete your account at any time from Settings → Privacy.</li>
        <li>“Hide amounts” masks numbers on screen for when someone's looking over your shoulder.</li>
      </ul>
      <p className="mt-6 text-muted">
        See also the <Link className="text-brand underline" href="/terms">Terms of Service</Link>.
        {SUPPORT_EMAIL && <> Questions: <a className="text-brand underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</>}
      </p>
    </main>
  );
}
