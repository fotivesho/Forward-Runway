import Link from "next/link";

export function Card({ title, action, children, className = "", id, as: Tag = "section" }: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  as?: "section" | "div" | "article";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Tag className={`card p-4 sm:p-5 ${className}`} id={id} aria-labelledby={title ? headingId : undefined}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && (
            <h2 id={headingId} className="text-base font-semibold text-ink">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function Badge({ tone = "neutral", children, title }: { tone?: "neutral" | "good" | "warn" | "bad" | "info"; children: React.ReactNode; title?: string }) {
  const tones = {
    neutral: "border-line text-muted",
    good: "border-brand/40 text-brand",
    warn: "border-warn/50 text-warn",
    bad: "border-danger/50 text-danger",
    info: "border-info/50 text-info",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "good"; title?: string; children: React.ReactNode }) {
  const tones = {
    info: "border-info/40 bg-info/5",
    warn: "border-warn/50 bg-warn/5",
    bad: "border-danger/50 bg-danger/5",
    good: "border-brand/40 bg-brand/5",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${tones[tone]}`}>
      {title && <p className="font-semibold text-ink">{title}</p>}
      <div className="text-muted">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function ButtonLink({ href, children, variant = "secondary", className = "" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return (
    <Link href={href} className={`btn btn-${variant} ${className}`}>
      {children}
    </Link>
  );
}

export function Disclosure({ summary, children, defaultOpen }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-xl border border-line bg-surface-2/40" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-ink">
        <span>{summary}</span>
        <span aria-hidden className="text-faint transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-line p-3">{children}</div>
    </details>
  );
}
