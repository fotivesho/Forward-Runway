"use client";

import { X } from "lucide-react";
import { Glyph } from "@/components/icon";
import { useEffect, useId, useRef, useState } from "react";

/**
 * A pop-up: a bottom sheet on phones, a centred card on larger screens.
 * Built on <dialog>, so focus is trapped, Esc closes it and the page behind is inert.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconNode,
  tone = "neutral",
  action,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Instead of `icon`: something of your own in its place (like a button). */
  iconNode?: React.ReactNode;
  /** Tints the header: income green, spending warm, neutral otherwise. */
  tone?: "neutral" | "in" | "out";
  /** A small button in the header, beside the close button (e.g. Edit). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Focus the sheet itself, not the close button (which would show a focus ring on open).
      panel.current?.focus({ preventScroll: true });
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Pull the sheet down to close it (phones): from the header anytime, or from the content once
  // it's scrolled to the top. It follows your finger; let go past a short distance and it closes.
  const body = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const p = panel.current;
    const d = ref.current;
    if (!open || !p || !d) return;
    let startY = 0;
    let dy = 0;
    let dragging = false;
    let armed = false;
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      // Not while using a slider, a text field or a horizontal scroller.
      if (t.closest("input, textarea, select, [data-no-swipe]")) return;
      const inBody = body.current?.contains(t);
      armed = !inBody || (body.current?.scrollTop ?? 0) <= 0;
      startY = e.touches[0]!.clientY;
      dy = 0;
      dragging = false;
    };
    const move = (e: TouchEvent) => {
      if (!armed) return;
      const y = e.touches[0]!.clientY - startY;
      if (!dragging) {
        if (y < 6) {
          if (y < -6) armed = false;
          return;
        }
        dragging = true;
        d.style.transition = "none";
      }
      dy = Math.max(0, y);
      d.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      armed = false;
      if (dy > Math.min(140, window.innerHeight * 0.18)) {
        d.style.transition = "transform 180ms ease-in";
        d.style.transform = "translateY(100%)";
        window.setTimeout(() => {
          d.style.transition = "";
          d.style.transform = "";
          onCloseRef.current();
        }, 170);
      } else {
        d.style.transition = "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        d.style.transform = "";
      }
    };
    p.addEventListener("touchstart", start, { passive: true });
    p.addEventListener("touchmove", move, { passive: false });
    p.addEventListener("touchend", end);
    p.addEventListener("touchcancel", end);
    return () => {
      p.removeEventListener("touchstart", start);
      p.removeEventListener("touchmove", move);
      p.removeEventListener("touchend", end);
      p.removeEventListener("touchcancel", end);
    };
  }, [open]);
  const head = { neutral: "from-surface-3/70", in: "from-brand/15", out: "from-warn/12" }[tone];
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A tap on the backdrop (the dialog itself, outside the panel) closes it.
        if (e.target === ref.current) onClose();
      }}
      className="fr-modal m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div ref={panel} tabIndex={-1} className="flex max-h-[92dvh] min-h-[62dvh] flex-col outline-none sm:min-h-0">
          <div className={`relative bg-gradient-to-b ${head} to-transparent px-5 pb-3 pt-3 sm:pt-5`}>
            <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex items-start gap-3">
              {iconNode ?? null}
              {!iconNode && icon && typeof icon === "string" ? <Glyph name={icon} size="lg" /> : !iconNode && icon && <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-xl shadow-sm">{icon}</span>}
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-bold leading-tight text-ink">{title}</h2>
                {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
              </div>
              {action}
              <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3/70 text-muted transition hover:bg-surface-3 hover:text-ink">
                <X size={16} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          </div>
          <div ref={body} className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** A button that opens a pop-up. `children` gets a `close` function, e.g. to close after saving. */
export function ModalButton({
  label,
  className = "btn btn-secondary",
  children,
  ...modal
}: Omit<React.ComponentProps<typeof Modal>, "open" | "onClose" | "children"> & {
  label: React.ReactNode;
  className?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={close} {...modal}>
        {children(close)}
      </Modal>
    </>
  );
}
