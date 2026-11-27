import { NextResponse } from "next/server";
import { sendMorningNotes } from "@/lib/push/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron calls this each morning with the CRON_SECRET; nobody else can trigger it. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return NextResponse.json(await sendMorningNotes());
}
