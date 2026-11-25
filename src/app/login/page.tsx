import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string; error?: string; setup?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/app") ? sp.next : "/app";
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 font-bold">
        <img src="/icon.svg" alt="" width={28} height={28} /> {APP_NAME}
      </Link>
      {!isSupabaseConfigured() ? (
        <div role="alert" className="card p-5">
          <h1 className="text-xl font-bold">Setup needed</h1>
          <p className="mt-2 text-sm text-muted">
            This server doesn't have Supabase configured yet. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see
            README → Deployment). Meanwhile, the <Link href="/demo" className="text-brand underline">demo</Link> works without an account.
          </p>
        </div>
      ) : (
        <LoginForm initialMode={sp.mode === "signup" ? "signup" : sp.mode === "reset" ? "reset" : "signin"} next={next} callbackError={sp.error ?? null} />
      )}
    </main>
  );
}
