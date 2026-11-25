import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted">That page doesn't exist.</p>
      <Link href="/app" className="btn btn-primary mt-6">Go to today</Link>
    </main>
  );
}
