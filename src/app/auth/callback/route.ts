import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Only same-site paths inside the app (or the reset page) are allowed as a destination. */
function safeNext(raw: string | null, type: EmailOtpType | null): string {
  if (type === "recovery") return "/reset-password";
  if (raw && (raw.startsWith("/app") || raw === "/reset-password") && !raw.startsWith("//")) return raw;
  return "/app";
}

/**
 * Completes email confirmation, magic-link and password-reset sign-ins.
 * Served at both /auth/callback and /auth/confirm, so email templates and
 * redirect URLs set up for either path keep working.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"), type);
  let ok = false;
  try {
    const supabase = await createClient();
    if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } catch {
    ok = false; // not configured or auth server unreachable: treat as an invalid link
  }

  if (!ok) return NextResponse.redirect(new URL(next === "/reset-password" ? "/login?mode=reset&error=link" : "/login?error=link", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
