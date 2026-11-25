import { NextResponse } from "next/server";
import { buildExport } from "@/lib/data/import-export";
import { loadSnapshot } from "@/lib/data/load";
import { getUser } from "@/lib/supabase/server";

/** Download all of the signed-in user's data as JSON (calendar addresses excluded). */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const snapshot = await loadSnapshot(supabase);
  const now = new Date().toISOString();
  const body = JSON.stringify(buildExport(snapshot, now), null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="runway-tomorrow-${now.slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
