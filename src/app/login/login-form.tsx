"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "magic" | "reset";

export function LoginForm({ initialMode, next, callbackError }: { initialMode: Mode; next: string; callbackError: string | null }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(callbackError ? "That sign-in link is invalid or expired. Please try again." : null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const router = useRouter();

  const site = typeof window !== "undefined" ? window.location.origin : "";
  const redirectTo = `${site}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const errs: typeof fieldErr = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address.";
    if ((mode === "signin" || mode === "signup") && password.length < (mode === "signup" ? 10 : 1))
      errs.password = mode === "signup" ? "Use at least 10 characters." : "Enter your password.";
    setFieldErr(errs);
    if (Object.keys(errs).length) {
      document.getElementById(errs.email ? "email" : "password")?.focus();
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) {
          router.replace("/app/onboarding");
          router.refresh();
        } else setInfo("Check your email to confirm your account, then come back here.");
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
        if (error) throw error;
        setInfo("If that email has an account, a sign-in link is on its way.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/confirm?next=/reset-password` });
        if (error) throw error;
        setInfo("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /invalid login/i.test(msg)
          ? "That email and password don't match."
          : /already registered/i.test(msg)
            ? "An account with that email already exists. Sign in instead."
            : /rate limit/i.test(msg)
              ? "Too many attempts. Please wait a minute and try again."
              : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = { signin: "Sign in", signup: "Create your account", magic: "Email me a sign-in link", reset: "Reset your password" };
  return (
    <div className="card p-5">
      <h1 className="font-display text-3xl leading-tight text-display">{titles[mode]}</h1>
      {mode === "signup" && <p className="mt-1 text-sm text-muted">Free while in beta.</p>}
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldErr.email ? true : undefined} aria-describedby={fieldErr.email ? "email-error" : undefined} required />
          {fieldErr.email && <p id="email-error" className="text-xs text-danger">{fieldErr.email}</p>}
        </div>
        {(mode === "signin" || mode === "signup") && (
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="input" value={password}
              onChange={(e) => setPassword(e.target.value)} aria-invalid={fieldErr.password ? true : undefined}
              aria-describedby={fieldErr.password ? "password-error" : mode === "signup" ? "password-hint" : undefined} required />
            {fieldErr.password ? <p id="password-error" className="text-xs text-danger">{fieldErr.password}</p> : mode === "signup" && <p id="password-hint" className="text-xs text-faint">At least 10 characters.</p>}
          </div>
        )}
        <div aria-live="polite">
          {error && <p role="alert" className="rounded-lg border border-danger/50 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
          {info && <p className="rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm text-brand">{info}</p>}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Please wait…" : titles[mode]}</button>
        {mode === "signup" && (
          <p className="text-xs text-faint">
            By creating an account you agree to the <Link href="/terms" className="underline">Terms of Service</Link> and{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        )}
      </form>
      <div className="mt-4 border-t border-line pt-4 text-center text-sm">
        {mode === "signup" ? (
          <button type="button" className="font-semibold text-brand" onClick={() => setMode("signin")}>Have an account? Sign in</button>
        ) : (
          <button type="button" className="font-semibold text-brand" onClick={() => setMode("signup")}>New here? Create an account</button>
        )}
        <p className="mt-2 flex justify-center gap-3 text-xs text-faint">
          {mode !== "magic" && <button type="button" className="underline hover:text-ink" onClick={() => setMode("magic")}>Email me a link</button>}
          {mode !== "reset" && <button type="button" className="underline hover:text-ink" onClick={() => setMode("reset")}>Forgot password?</button>}
          {(mode === "magic" || mode === "reset") && <button type="button" className="underline hover:text-ink" onClick={() => setMode("signin")}>Back to sign in</button>}
        </p>
      </div>
    </div>
  );
}
