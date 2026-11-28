"use client";

import { useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Tag } from "lucide-react";
import { createCategory, moveCategory } from "@/app/app/actions";
import { CATEGORY_LIST, isNotSpending } from "@/lib/categories";
import { DemoCtx } from "./form";
import { GlyphView, PICKABLE, PICKABLE_COLORS, styleFor } from "@/components/icon";
import { useCategoryStyles } from "./custom-glyph";
import { Modal } from "./modal";

/**
 * Edit a category wherever it shows up: its name, symbol and color, or delete it by moving what's
 * in it to another category. Built-in categories too.
 */
export function CategoryEditor({ name, others = [], onDone }: { name: string; others?: string[]; onDone: (result: { renamed?: string; deleted?: boolean } | null) => void }) {
  const demo = useContext(DemoCtx);
  const router = useRouter();
  const { styles, hidden, add } = useCategoryStyles();
  const mine = styles[name];
  const [newName, setNewName] = useState(name);
  const [icon, setIcon] = useState(mine?.icon ?? "tag");
  const [color, setColor] = useState(mine?.color ?? PICKABLE_COLORS[0]!);
  const [styled, setStyled] = useState(!!mine?.icon);
  const [del, setDel] = useState(false);
  const [to, setTo] = useState("Other");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const locked = isNotSpending(name);
  const targets = [...new Set([...others, ...Object.keys(styles), ...CATEGORY_LIST, "Other"])].filter((c) => c !== name && !hidden.includes(c) && !isNotSpending(c));
  const current = styled ? ([PICKABLE[icon] ?? Tag, color] as const) : (styleFor(name, mine) ?? [Tag, "#9aa7b4"]);

  const save = () =>
    start(async () => {
      const n = newName.trim().replace(/\s+/g, " ");
      if (!n) return setErr("Give it a name.");
      if (demo) return setErr("Demo: changes aren't saved.");
      if (n !== name) {
        const r = await moveCategory(name, n);
        if (!r.ok) return setErr(r.error ?? "Couldn't save that.");
      }
      if (styled) {
        const r = await createCategory(n, icon, color);
        if (!r.ok) return setErr(r.error ?? "Couldn't save that.");
        add(n, { icon, color });
      }
      router.refresh();
      onDone(n !== name ? { renamed: n } : null);
    });
  const remove = () =>
    start(async () => {
      if (demo) return setErr("Demo: changes aren't saved.");
      const r = await moveCategory(name, to);
      if (!r.ok) return setErr(r.error ?? "Couldn't delete that.");
      router.refresh();
      onDone({ deleted: true, renamed: to });
    });

  if (locked) return <p className="text-sm text-muted">{name} is built in: it keeps transfers and card payments out of your spending, so it can&apos;t be changed.</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GlyphView style={current as never} size="md" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Category name</span>
          <input value={newName} onChange={(e) => { setNewName(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && save()} maxLength={40} className="input w-full" />
        </label>
      </div>
      <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Symbol">
        {Object.entries(PICKABLE).map(([k, I]) => (
          <button key={k} type="button" role="radio" aria-checked={styled && icon === k} aria-label={k} onClick={() => { setIcon(k); setStyled(true); }} className={`flex h-8 items-center justify-center rounded-lg transition ${styled && icon === k ? "bg-surface ring-2 ring-brand" : "hover:bg-surface"}`}>
            <I size={16} strokeWidth={2.2} color={styled && icon === k ? color : undefined} className={styled && icon === k ? "" : "text-muted"} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
        {PICKABLE_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={styled && color === c} aria-label={c} onClick={() => { setColor(c); setStyled(true); }} className={`h-7 w-7 rounded-full transition ${styled && color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => onDone(null)} className="btn btn-ghost btn-sm">Cancel</button>
        <button type="button" onClick={() => setDel((d) => !d)} aria-expanded={del} className="ml-auto text-xs font-semibold text-danger">Delete…</button>
      </div>
      {del && (
        <div className="fade-up space-y-2 rounded-xl border border-danger/40 p-3">
          <label className="block text-xs text-muted">
            Move everything in {name} to
            <select value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 w-full">
              {targets.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <button type="button" onClick={remove} disabled={busy} className="btn btn-danger btn-sm">{busy ? "Deleting…" : `Delete ${name}`}</button>
        </div>
      )}
      {err && <p className="text-xs text-warn" role="alert">{err}</p>}
      <p className="text-[11px] text-faint">Renaming moves every transaction, repeating item, plan and budget with it, and new ones from your bank follow.</p>
    </div>
  );
}

/** A small pencil for a category's pop-up header: opens the editor. */
export function CategoryEditButton({ name, onChanged }: { name: string; onChanged?: (result: { renamed?: string; deleted?: boolean }) => void }) {
  const [open, setOpen] = useState(false);
  if (isNotSpending(name)) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Edit ${name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3/70 text-muted transition hover:bg-surface-3 hover:text-ink">
        <Pencil size={14} strokeWidth={2.4} aria-hidden />
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} icon={name} title={`Edit ${name}`} subtitle="Name, symbol and color, or delete it.">
          <CategoryEditor name={name} onDone={(r) => { setOpen(false); if (r) onChanged?.(r); }} />
        </Modal>
      )}
    </>
  );
}
