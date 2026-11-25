import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { isPrivateAddress } from "./net-guard";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export class FetchIcsError extends Error {}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "https:") throw new FetchIcsError("Only https calendar addresses are supported.");
  if (url.username || url.password) throw new FetchIcsError("Calendar addresses with embedded passwords aren't supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new FetchIcsError("That address points to a private network.");
    return;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new FetchIcsError("That address points to a private network.");
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new FetchIcsError("Couldn't find that calendar's server.");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new FetchIcsError("That address points to a private network.");
}

/**
 * Download an iCal feed from a user-supplied address. https only, public hosts
 * only (checked again on every redirect), 10s timeout, 5 MB limit.
 */
export async function fetchIcs(rawUrl: string): Promise<string> {
  let url = new URL(rawUrl.trim().replace(/^webcal:/i, "https:"));
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "User-Agent": "CashFlowPlanner-CalendarSync/1.0" },
        cache: "no-store",
      });
    } catch (e) {
      throw new FetchIcsError(e instanceof Error && e.name === "TimeoutError" ? "The calendar server took too long to answer." : "Couldn't reach the calendar server.");
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new FetchIcsError("The calendar server sent a broken redirect.");
      url = new URL(loc, url);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new FetchIcsError("The calendar server refused access. The secret address may have been reset.");
    if (res.status === 404) throw new FetchIcsError("Calendar not found. The secret address may have changed.");
    if (!res.ok) throw new FetchIcsError(`The calendar server returned an error (${res.status}).`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new FetchIcsError("That calendar is larger than 5 MB.");
    const reader = res.body?.getReader();
    if (!reader) throw new FetchIcsError("The calendar server sent an empty response.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new FetchIcsError("That calendar is larger than 5 MB.");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new FetchIcsError("Too many redirects.");
}
