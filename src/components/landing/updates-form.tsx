"use client";

import { useActionState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { joinUpdates, type UpdatesState } from "@/app/updates-actions";

/** One sleek line: email in, a round arrow button, and a quiet confirmation in place. */
export function UpdatesForm() {
  const [state, action, pending] = useActionState<UpdatesState, FormData>(joinUpdates, null);
  if (state?.ok) {
    return (
      <p role="status" className="fade-up mx-auto flex max-w-md items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm text-[#ddefbf]">
        <Check size={16} strokeWidth={2.6} aria-hidden /> {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="mx-auto max-w-md" aria-label="Get updates">
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] p-1 pl-5 backdrop-blur focus-within:border-[#ddefbf]/60">
        <label htmlFor="updates-email" className="sr-only">Email</label>
        <input
          id="updates-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Not ready? Leave your email"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[#f1f6ea] outline-none placeholder:text-[#b9cbb4]"
        />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-label="Leave this empty" className="hidden" />
        <button type="submit" disabled={pending} aria-label="Send me updates" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ddefbf] text-[#182d26] transition hover:bg-white disabled:opacity-60">
          <ArrowRight size={18} strokeWidth={2.6} aria-hidden />
        </button>
      </div>
      <p className={`mt-2 text-center text-xs ${state && !state.ok ? "text-[#ffb4a8]" : "text-[#b9cbb4]"}`} aria-live="polite">
        {state && !state.ok ? state.message : "A note when something new lands. Nothing else, ever."}
      </p>
    </form>
  );
}
