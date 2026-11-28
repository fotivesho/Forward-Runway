"use client";

import { useState } from "react";
import { showCategory } from "@/app/app/actions";
import { QuickAction } from "./form";
import { Glyph } from "@/components/icon";
import { CategoryEditor } from "./category-editor";

/**
 * Every category, built-in ones too: tap one to rename it, change its symbol and color, or delete it
 * by moving what's in it to another. Ones you've removed can be offered again.
 */
export function CategoryManager({ categories, hidden }: { categories: Array<{ name: string; count: number }>; hidden: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      {note && <p className="mb-2 rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted" aria-live="polite">{note}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line">
        {categories.map((c) => (
          <li key={c.name}>
            <button type="button" onClick={() => setOpen(open === c.name ? null : c.name)} aria-expanded={open === c.name} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
              <Glyph name={c.name} size="xs" />
              <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
              <span className="text-xs text-faint">{c.count || ""}</span>
              <span aria-hidden className={`text-faint transition ${open === c.name ? "rotate-90" : ""}`}>›</span>
            </button>
            {open === c.name && (
              <div className="fade-up px-3 pb-3">
                <CategoryEditor name={c.name} others={categories.map((x) => x.name)} onDone={(r) => { setOpen(null); if (r) setNote(r.deleted ? `${c.name} deleted.` : `Renamed to ${r.renamed}.`); }} />
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
