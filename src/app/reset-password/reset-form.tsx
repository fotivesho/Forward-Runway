"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Reached from the password-reset email (via /auth/confirm, which signs the user in for this purpose). */
export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [errors, setErrors] = useState<{ pw?: string; pw2?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      createClient()
        .auth.getUser()
        .then(({ data }) => setReady(data.user ? "yes" : "no"))
        .catch(() => setReady("no"));
    } catch {
      setReady("no");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: typeof errors = {};
    if (pw.length < 10) errs.pw = "Use at least 10 characters.";
    if (pw2 !== pw) errs.pw2 = "The two passwords don't match.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(errs.pw ? "new-pw" : "new-pw-2")?.focus();
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setError(/same/i.test(error.message) ? "Choose a password different from your old one." : "Couldn't save your new password. Request a new reset link and try again.");
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.replace("/app");
      router.refresh();
    }, 1200);
  }

  if (ready === "checking") {
    return <p className="card p-5 text-sm text-muted" aria-live="polite">Checking your reset link…</p>;
  }
  if (ready === "no") {
    return (
      <div role="alert" className="card p-5">
        <h1 className="text-xl font-bold">This reset link has expired</h1>
        <p className="mt-2 text-sm text-muted">Reset links work once and expire after a short time. Request a new one and use the latest email.</p>
        <Link href="/login?mode=reset" className="btn btn-primary mt-4">Send a new link</Link>
      </div>
    );
  }
  return (
    <div className="card p-5">
      <h1 className="text-xl font-bold">Choose a new password</h1>
      {done ? (
        <p role="status" className="mt-4 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm text-brand">Password saved. Taking you to your runway…</p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-pw" className="text-sm font-medium">New password</label>
            <input id="new-pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)}
              aria-invalid={errors.pw ? true : undefined} aria-describedby={errors.pw ? "new-pw-error" : "new-pw-hint"} />
            {errors.pw ? <p id="new-pw-error" className="text-xs text-danger">{errors.pw}</p> : <p id="new-pw-hint" className="text-xs text-faint">At least 10 characters.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-pw-2" className="text-sm font-medium">Type it again</label>
            <input id="new-pw-2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)}
              aria-invalid={errors.pw2 ? true : undefined} aria-describedby={errors.pw2 ? "new-pw-2-error" : undefined} />
            {errors.pw2 && <p id="new-pw-2-error" className="text-xs text-danger">{errors.pw2}</p>}
          </div>
          <div aria-live="polite">{error && <p role="alert" className="rounded-lg border border-danger/50 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}</div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
        </form>
      )}
    </div>
  );
}
