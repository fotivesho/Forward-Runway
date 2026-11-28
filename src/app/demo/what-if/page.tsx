import { redirect } from "next/navigation";

/** Moved into Plan. Old links keep working, with their options (like ?add=1). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v == null ? [] : [[k, v]])) as Array<[string, string]>).toString();
  redirect("/demo/plan/what-if" + (q ? "?" + q : ""));
}
