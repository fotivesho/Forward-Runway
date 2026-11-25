import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="text-brand underline">← Runway Tomorrow</Link>
      <h1 className="mt-4 text-2xl font-bold">Privacy</h1>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
        <li>Your financial data is stored in a Postgres database with row-level security: every row belongs to your account, and the database itself refuses to show or change it for anyone else.</li>
        <li>No bank connections and no AI services. Nothing you enter is sent to third parties.</li>
        <li>Calendar addresses you connect are secret links. They're read only by the server to sync, never shown back in full, and never included in exports.</li>
        <li>Financial pages are never cached by the app's offline support or shared caches.</li>
        <li>The public demo uses only made-up data generated in code.</li>
        <li>You can export everything as JSON, wipe all your data, or delete your account at any time from Settings → Privacy.</li>
        <li>“Hide amounts” masks numbers on screen for when someone's looking over your shoulder.</li>
      </ul>
    </main>
  );
}
