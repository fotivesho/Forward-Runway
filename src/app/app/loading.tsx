/** While a screen loads: the shape of what's coming (a hero, a line, a list), softly pulsing. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-auto grid w-full max-w-2xl gap-5">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-32 animate-pulse rounded-lg bg-surface-2" />
      <div className="card animate-pulse p-5">
        <div className="h-3 w-24 rounded bg-surface-3" />
        <div className="mt-4 h-14 w-40 rounded-lg bg-surface-3" />
        <div className="mt-3 h-3 w-48 rounded bg-surface-2" />
        <div className="mt-5 h-10 w-36 rounded-xl bg-surface-3" />
      </div>
      <div className="card h-14 animate-pulse" />
      <div className="card animate-pulse space-y-4 p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-surface-3" />
            <div className="flex-1 space-y-1.5"><div className="h-3 w-2/3 rounded bg-surface-3" /><div className="h-2.5 w-1/3 rounded bg-surface-2" /></div>
            <div className="h-3 w-12 rounded bg-surface-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
