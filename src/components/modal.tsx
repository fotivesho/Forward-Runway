"use client";

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
  tone = "neutral",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Tints the header: income green, spending warm, neutral otherwise. */
  tone?: "neutral" | "in" | "out";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
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
        <div className="flex max-h-[92dvh] flex-col">
          <div className={`relative bg-gradient-to-b ${head} to-transparent px-5 pb-3 pt-3 sm:pt-5`}>
            <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex items-start gap-3">
              {icon && <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-xl shadow-sm">{icon}</span>}
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-bold leading-tight text-ink">{title}</h2>
                {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-ink">
                ✕
              </button>
            </div>
          </div>
          <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">{children}</div>
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
