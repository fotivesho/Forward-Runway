import { APP_NAME } from "@/lib/brand";

/** The runway-and-plane mark on its own (always on the brand's deep green). */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} className={`shrink-0 rounded-[22%] ${className}`} aria-hidden="true">
      <rect width="400" height="400" fill="#182d26" />
      <path d="M117.5 295.5V210.5A55 55 0 0 1 172.5 155.5H226.5" fill="none" stroke="#ddefbf" strokeWidth="45" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M117.5 289V210.5A55 55 0 0 1 172.5 155.5H229" fill="none" stroke="#55644f" strokeWidth="5" strokeDasharray="13 11" />
      <g transform="translate(293.5 123.5) rotate(52) scale(3.35) translate(-12 -12)">
        <path fill="#ddefbf" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </g>
    </svg>
  );
}

/** Mark + "runway." wordmark with "TOMORROW" beneath. The accessible name is the full app name. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const mark = size === "lg" ? 44 : 32;
  return (
    <span className="inline-flex items-center gap-2" aria-label={APP_NAME} role="img">
      <LogoMark size={mark} />
      <span className="flex flex-col leading-none" aria-hidden="true">
        <span className={`font-semibold tracking-tight text-ink ${size === "lg" ? "text-2xl" : "text-lg"}`}>
          runway<span className="text-brand">.</span>
        </span>
        <span className={`font-semibold uppercase tracking-[0.28em] text-muted ${size === "lg" ? "text-[11px]" : "text-[9px]"}`}>tomorrow</span>
      </span>
    </span>
  );
}
