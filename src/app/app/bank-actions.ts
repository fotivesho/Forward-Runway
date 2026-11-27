"use server";

import { revalidatePath } from "next/cache";
import { todayInZone } from "@/lib/dates";
import { getUser } from "@/lib/supabase/server";
import { plaidMode } from "@/lib/plaid/config";
import { connectBank, disconnectBank, linkToken, syncBank } from "@/lib/plaid/sync";

export type BankResult = { ok: true; message: string; token?: string } | { ok: false; message: string };

async function signedIn() {
  const { supabase, user } = await getUser();
  if (!user) throw new Error("Please sign in again.");
  const { data } = await supabase.from("profiles").select("timezone").maybeSingle();
  return { supabase, user, today: todayInZone((data?.timezone as string) || "America/New_York") };
}

const uuid = /^[0-9a-f-]{36}$/i;

/** Starts Plaid Link: a short-lived token for the browser. With a connection id, re-signs in to that bank. */
export async function startBankLink(connectionId?: string): Promise<BankResult> {
  if (plaidMode() === "off") return { ok: false, message: "Bank connections aren't available yet." };
  if (connectionId && !uuid.test(connectionId)) return { ok: false, message: "Unknown connection." };
  try {
    const { user } = await signedIn();
    return { ok: true, message: "", token: await linkToken(user.id, connectionId) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't start the bank connection." };
  }
}

/** Plaid Link finished: save the connection and import balances, statements and transactions. */
export async function finishBankLink(publicToken: string, institutionName: string | null): Promise<BankResult> {
  if (plaidMode() === "off") return { ok: false, message: "Bank connections aren't available yet." };
  if (typeof publicToken !== "string" || publicToken.length > 300 || !/^public-/.test(publicToken)) return { ok: false, message: "That didn't come from Plaid." };
  const name = typeof institutionName === "string" ? institutionName.replace(/[^\p{L}\p{N} &'.,()-]/gu, "").slice(0, 100) || null : null;
  try {
    const { supabase, user, today } = await signedIn();
    const r = await connectBank(supabase, user.id, publicToken, name, today);
    revalidatePath("/app", "layout");
    return r.ok ? { ok: true, message: `Connected. ${r.message}` } : { ok: false, message: r.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't connect the bank." };
  }
}

export async function syncBankNow(connectionId: string): Promise<BankResult> {
  if (plaidMode() === "off" || !uuid.test(connectionId)) return { ok: false, message: "Unknown connection." };
  const { supabase, user, today } = await signedIn();
  const r = await syncBank(supabase, user.id, connectionId, today);
  revalidatePath("/app", "layout");
  return { ok: r.ok, message: r.message };
}

export async function disconnectBankNow(connectionId: string, removeAccounts = false): Promise<BankResult> {
  if (plaidMode() === "off" || !uuid.test(connectionId)) return { ok: false, message: "Unknown connection." };
  const { supabase, user } = await signedIn();
  await disconnectBank(supabase, user.id, connectionId, removeAccounts === true);
  revalidatePath("/app", "layout");
  return removeAccounts
    ? { ok: true, message: "Removed the bank and its accounts." }
    : { ok: true, message: "Disconnected. Your accounts and history stay, and you can keep them up to date by hand." };
}

/** How long a bank's data counts as fresh before opening the app syncs it again. */
const FRESH_MINUTES = 30;

/**
 * Runs quietly when you open the app: every connected bank not synced in the last half hour is
 * synced now (banks that need you to sign in again are left for you). Returns how many new
 * transactions came in, so the page only refreshes when something changed.
 */
export async function autoSyncBanks(): Promise<{ synced: number; added: number }> {
  if (plaidMode() === "off") return { synced: 0, added: 0 };
  try {
    const { supabase, user, today } = await signedIn();
    const cutoff = new Date(Date.now() - FRESH_MINUTES * 60_000).toISOString();
    const { data } = await supabase
      .from("bank_connections")
      .select("id, status, last_synced_at")
      .neq("status", "needs_reauth")
      .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`);
    let synced = 0;
    let added = 0;
    for (const c of data ?? []) {
      const r = await syncBank(supabase, user.id, String(c.id), today);
      if (r.ok) synced++;
      added += r.added;
    }
    if (synced) revalidatePath("/app", "layout");
    return { synced, added };
  } catch {
    return { synced: 0, added: 0 };
  }
}
