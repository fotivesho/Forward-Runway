"use client";

import { useContext, useState, useTransition } from "react";
import { Plus, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { createCategory } from "@/app/app/actions";
import { DemoCtx } from "./form";
import { GlyphView, PICKABLE, PICKABLE_COLORS } from "@/components/icon";
import { useCategoryStyles } from "./custom-glyph";
import { Modal } from "./modal";

/** A category of your own: a name, a symbol and a color. Used in pop-ups, Activity and Budget. */
export function NewCategoryForm({ onCreated }: { onCreated: (name: string) => void }) {
  const demo = useContext(DemoCtx);
  const { add } = useCategoryStyles();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState(PICKABLE_COLORS[0]!);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const create = () =>
    start(async () => {
      const n = name.trim();
      if (!n) return setErr("Give it a name.");
      if (!demo) {
        const r = await createCategory(n, icon, color);
        if (!r.ok) return setErr(r.error ?? "Couldn't save that.");
      }
      add(n, { icon, color });
      onCreated(n);
    });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GlyphView style={[PICKABLE[icon] ?? Tag, color]} size="md" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Category name</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && create()} maxLength={40} placeholder="Name it, like Pets" className="input w-full" autoFocus />
        </label>
      </div>
      <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Symbol">
        {Object.entries(PICKABLE).map(([k, I]) => (
          <button key={k} type="button" role="radio" aria-checked={icon === k} aria-label={k} onClick={() => setIcon(k)} className={`flex h-8 items-center justify-center rounded-lg transition ${icon === k ? "bg-surface ring-2 ring-brand" : "hover:bg-surface"}`}>
            <I size={16} strokeWidth={2.2} color={icon === k ? color : undefined} className={icon === k ? "" : "text-muted"} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
        {PICKABLE_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full transition ${color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={create} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Create"}</button>
        {demo && <span className="text-xs text-faint">Demo: not saved.</span>}
      </div>
      {err && <p className="text-xs text-warn" role="alert">{err}</p>}
    </div>
  );
}

/** "+ New category": a small button that opens the form in a pop-up. */
export function NewCategoryButton({ className = "", label = "New category" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => { setDone(null); setOpen(true); }} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-brand/60 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10 ${className}`}>
        <Plus size={13} strokeWidth={2.6} aria-hidden /> {label}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} icon="🏷️" title="New category" subtitle="Pick a name, a symbol and a color.">
          {done ? (
            <div className="space-y-3 text-sm text-muted">
              <p><b className="text-ink">{done}</b> is ready. Pick it from any transaction&apos;s category, and it shows up in your budget and reports as soon as something&apos;s in it.</p>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-sm">Done</button>
            </div>
          ) : (
            <NewCategoryForm onCreated={(n) => { setDone(n); router.refresh(); }} />
          )}
        </Modal>
      )}
    </>
  );
}
