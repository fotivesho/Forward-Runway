import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-4xl leading-tight text-display">Off the runway.</h1>
      <p className="mt-2 text-muted">This page doesn&apos;t exist.</p>
      <Link href="/" className="btn btn-primary mt-6">Back home</Link>
    </main>
  );
}
