import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center">
        <Logo />
      </Link>
      <ResetPasswordForm />
    </main>
  );
}
