"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Search } from "lucide-react";
import { CategoryEditor } from "./category-editor";
import { CATEGORY_LIST, isNotSpending } from "@/lib/categories";
import { Glyph } from "@/components/icon";
import { useCategoryStyles } from "./custom-glyph";
import { NewCategoryForm } from "./new-category";
import Link from "next/link";
import { usePathname } from "next/navigation";

const INCOME_KINDS = ["Income", "Salary", "Interest"];

/**
 * A pill showing the category; tap it and a compact, scrollable list pops out under it:
 * type to narrow, tap to pick, or make a new one right there. Used everywhere a category is chosen.
 */
export function CategoryMenu({
  value,
  direction = "out",
  yours = [],
  onPick,
  size = "md",
  disabled,
}: {
  value: string | null;
  direction?: "in" | "out";
  yours?: string[];
  onPick: (category: string) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Inside a pop-up the list opens in place and pushes the sheet taller, instead of floating in a
  // small box that the sheet cuts off.
  const [inSheet, setInSheet] = useState(false);
  useEffect(() => {
    if (open) setInSheet(!!box.current?.closest("dialog"));
  }, [open]);
  const [q, setQ] = useState("");
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { styles, hidden } = useCategoryStyles();
  const manage = usePathname()?.startsWith("/demo") ? "/demo/settings#categories" : "/app/settings#categories";
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const spend = [...new Set([...Object.keys(styles), ...yours, ...CATEGORY_LIST])].filter((c) => !isNotSpending(c) && !INCOME_KINDS.includes(c) && c !== "Other" && !hidden.includes(c));
  const all = direction === "in" ? [...INCOME_KINDS, "Transfer", ...spend, "Other"] : [...spend, "Other", "Transfer"];
  const list = q ? all.filter((c) => c.toLowerCase().includes(q.toLowerCase())) : all;
  const shown = value ?? (direction === "in" ? "Income" : "Uncategorized");
  const pick = (c: string) => {
    onPick(c);
    setOpen(false);
    setQ("");
    setMaking(false);
    setEditing(null);
  };

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 rounded-full border font-semibold text-ink transition hover:border-brand/60 ${open ? "border-brand bg-brand/10" : "border-line"} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "min-h-9 px-3 text-sm"}`}
      >
        <Glyph name={value ?? (direction === "in" ? "income" : "spend")} size="xs" bare /> {shown}
        <span aria-hidden className={`text-faint transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className={`fade-up z-30 overflow-hidden rounded-2xl border border-line bg-surface ${inSheet ? "relative mt-2 w-[min(20rem,calc(100vw-2.5rem))]" : "absolute left-0 top-full mt-1.5 w-64 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)]"}`}>
          <label className="flex items-center gap-2 border-b border-line px-3">
            <Search size={14} className="text-faint" aria-hidden />
            <span className="sr-only">Find a category</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" className="pill-input min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-faint" />
          </label>
          {editing ? (
            <div className="max-h-[70vh] overflow-y-auto p-3">
              <CategoryEditor
                name={editing}
                others={spend}
                onDone={(r) => {
                  // Editing the one this is set to: follow it to its new name.
                  if (r?.renamed && editing === value) onPick(r.renamed);
                  setEditing(null);
                }}
              />
            </div>
          ) : making ? (
            <div className="p-3"><NewCategoryForm onCreated={pick} initialName={q} /></div>
          ) : (
            <>
              <ul role="listbox" aria-label="Categories" data-no-swipe className={`${inSheet ? "max-h-[48dvh]" : "max-h-64"} overflow-y-auto overscroll-contain py-1`}>
                {list.map((c) => (
                  <li key={c} className="flex items-center">
                    <button type="button" role="option" aria-selected={c === value} onClick={() => pick(c)} className={`flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left text-sm transition hover:bg-surface-2 ${c === value ? "font-semibold text-ink" : "text-muted"}`}>
                      <Glyph name={c} size="xs" />
                      <span className="flex-1 truncate">{c}</span>
                      {c === value && <Check size={14} className="text-brand" aria-hidden />}
                    </button>
                    {!["Transfer", "Card payment", "Other", "Income", "Salary", "Interest"].includes(c) && (
                      <button type="button" onClick={() => setEditing(c)} aria-label={`Edit ${c}`} className="flex h-9 w-9 shrink-0 items-center justify-center text-faint transition hover:text-ink">
                        <Pencil size={12} strokeWidth={2.4} aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
                {list.length === 0 && <li className="px-3 py-2 text-xs text-faint">No match.</li>}
              </ul>
              <button type="button" onClick={() => setMaking(true)} className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-sm font-semibold text-brand transition hover:bg-surface-2">
                <Plus size={14} strokeWidth={2.6} aria-hidden /> {q ? `New category “${q}”` : "New category"}
              </button>
              <Link href={manage} className="block border-t border-line px-3 py-2 text-xs text-muted transition hover:bg-surface-2 hover:text-ink">Rename or delete categories…</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
