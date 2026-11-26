import Link from "next/link";
import type { Metadata } from "next";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of Service" };

const EFFECTIVE = "November 26, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-muted">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="text-brand underline">← {APP_NAME}</Link>
      <h1 className="font-display mt-4 text-4xl leading-tight text-display">Terms of Service</h1>
      <p className="mt-1 text-xs text-faint">Effective {EFFECTIVE}</p>
      <p className="mt-4 text-muted">
        These terms cover your use of {APP_NAME} at runwaytomorrow.com (the “service”). By creating an account or using the service, you agree to them.
        If you don't agree, please don't use the service.
      </p>

      <Section title="1. What the service does">
        <p>
          {APP_NAME} helps you plan your personal cash flow: it forecasts your balances from the information you enter or connect, suggests a daily
          spending amount, and estimates whether planned purchases fit. It's a planning tool.
        </p>
        <p>
          <strong className="text-ink">It isn't financial, investment, tax or legal advice</strong>, and it doesn't move money. Forecasts are estimates
          based on your information and simple, stated assumptions. They can be wrong, for example if a balance is out of date, a bill changes or a
          bank reports data late. Check important decisions against your bank and card statements.
        </p>
      </Section>

      <Section title="2. Who can use it">
        <p>You must be at least 18 and able to agree to these terms. The service is designed for personal use with accounts in the United States.</p>
      </Section>

      <Section title="3. Your account">
        <p>
          Keep your sign-in details private and tell us if you think someone else has used your account. You're responsible for what happens in your
          account, and for making sure the information you enter is yours to use.
        </p>
      </Section>

      <Section title="4. Connecting a bank (optional)">
        <p>
          You can connect bank and card accounts through Plaid Inc. (“Plaid”). You sign in to your bank in Plaid's window; {APP_NAME} never sees or
          stores your bank username or password. By connecting, you authorize {APP_NAME} and Plaid to access your account balances, transactions,
          and card statement details, read-only, so the service can show and forecast them. {APP_NAME} cannot make payments or transfers.
        </p>
        <p>
          You also agree to Plaid's handling of your information under the{" "}
          <a className="text-brand underline" href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener noreferrer">
            Plaid End User Privacy Policy
          </a>
          . You can disconnect a bank at any time from the Accounts page, which also removes the connection at Plaid.
        </p>
      </Section>

      <Section title="5. Your data">
        <p>
          Your financial information belongs to you. We use it only to provide the service to you, as described in our{" "}
          <Link className="text-brand underline" href="/privacy">Privacy Policy</Link>. We don't sell it or use it for advertising. You can export it,
          wipe it, or delete your account at any time from Settings.
        </p>
      </Section>

      <Section title="6. Acceptable use">
        <p>
          Don't misuse the service: no attempts to access other people's data, break or overload the service, get around its security, or use it for
          anything unlawful. Don't connect accounts you aren't authorized to access.
        </p>
      </Section>

      <Section title="7. Availability and changes">
        <p>
          The service is provided “as is” and “as available”. We work to keep it running and accurate but can't promise it will always be available,
          error-free, or that bank connections will always work (banks and Plaid can change or interrupt access). We may change, add or remove
          features, and we may update these terms; if a change is significant, we'll tell you in the app or by email before it takes effect.
        </p>
      </Section>

      <Section title="8. Limitation of liability">
        <p>
          To the fullest extent the law allows, {APP_NAME} and its operator are not liable for indirect, incidental or consequential losses, including
          overdraft or late fees, interest, or decisions made based on a forecast or suggestion. Our total liability for any claim about the service
          is limited to the amount you paid us for it in the 12 months before the claim (or $0 if you use it for free). Some places don't allow these
          limits, so they may not apply to you.
        </p>
      </Section>

      <Section title="9. Ending your use">
        <p>
          You can stop using the service and delete your account at any time from Settings. We may suspend or close accounts that break these terms
          or put the service or other people at risk.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions about these terms or your data:{" "}
          {SUPPORT_EMAIL ? (
            <a className="text-brand underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          ) : (
            <>reply to any email you've received from {APP_NAME}.</>
          )}
        </p>
      </Section>
    </main>
  );
}
