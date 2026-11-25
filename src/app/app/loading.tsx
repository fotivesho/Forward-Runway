export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-4">
      <span className="sr-only">Loading your forecast…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-40 animate-pulse bg-surface-2/50" />
      ))}
    </div>
  );
}
