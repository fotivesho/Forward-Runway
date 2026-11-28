"use client";

import { useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveCategory, showCategory } from "@/app/app/actions";
import { DemoCtx, QuickAction } from "./form";
import { Glyph } from "@/components/icon";

/**
 * Every category, built-in ones too: rename one, or delete it by moving what's in it to another.
 * Ones you've removed can be offered again.
 */
export function CategoryManager({ categories, hidden }: { categories: Array<{ name: string; count: number }>; hidden: string[] }) {
  const demo = useContext(DemoCtx);
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"rename" | "delete">("rename");
  const [name, setName] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const others = (c: string) => categories.filter((x) => x.name !== c).map((x) => x.name);
  const toggle = (c: string) => {
    setOpen(open === c ? null : c);
    setMode("rename");
    setName(c);
    setTo("Other");
    setNote(null);
  };
  const run = (from: string, target: string, done: string) => {
    if (demo) return setNote("Demo: changes aren't saved.");
    start(async () => {
      const r = await moveCategory(from, target);
      if (!r.ok) return setNote(r.error ?? "Couldn't save that.");
      setOpen(null);
      setNote(`${done}${r.moved ? ` · ${r.moved} transaction${r.moved === 1 ? "" : "s"} moved` : ""}.`);
      router.refresh();
    });
  };
  return (
    <div>
      {note && <p className="mb-2 rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted" aria-live="polite">{note}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line">
        {categories.map((c) => (
          <li key={c.name}>
            <button type="button" onClick={() => toggle(c.name)} aria-expanded={open === c.name} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
              <Glyph name={c.name} size="xs" />
              <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
              <span className="text-xs text-faint">{c.count || ""}</span>
              <span aria-hidden className={`text-faint transition ${open === c.name ? "rotate-90" : ""}`}>›</span>
            </button>
            {open === c.name && (
              <div className="fade-up space-y-2 px-3 pb-3">
                <div role="group" aria-label="Rename or delete" className="flex w-fit rounded-full border border-line p-0.5 text-xs font-semibold">
                  {(["rename", "delete"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`min-h-7 rounded-full px-3 ${mode === m ? "bg-surface-3 text-ink" : "text-muted"}`}>
                      {m === "rename" ? "Rename" : "Delete"}
                    </button>
                  ))}
                </div>
                {mode === "rename" ? (
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== c.name) run(c.name, name.trim(), `Renamed to ${name.trim()}`); }}>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="New name" className="input min-w-0 flex-1" />
                    <button type="submit" disabled={busy || !name.trim() || name.trim() === c.name} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save"}</button>
                  </form>
                ) : (
                  <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(c.name, to, `${c.name} deleted`); }}>
                    <label className="block text-xs text-muted">
                      {c.count ? `Move its ${c.count} transaction${c.count === 1 ? "" : "s"} to` : "Anything in it later goes to"}
                      <select value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 w-full">
                        {[...new Set([...others(c.name), "Other"])].map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <button type="submit" disabled={busy} className="btn btn-danger btn-sm">{busy ? "Deleting…" : `Delete ${c.name}`}</button>
                  </form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Removed:</span>
          {hidden.map((h) => (
            <QuickAction key={h} action={showCategory} fields={{ name: h }} variant="ghost">{h} ↺</QuickAction>
          ))}
        </div>
      )}
    </div>
  );
}
