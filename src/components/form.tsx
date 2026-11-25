"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/app/actions";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

const FormCtx = createContext<{ state: ActionState; disabled: boolean; submitDisabled: boolean }>({ state: null, disabled: false, submitDisabled: false });

/** In the public demo every form is read-only. */
export const DemoCtx = createContext(false);
export function DemoProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  return <DemoCtx.Provider value={demo}>{children}</DemoCtx.Provider>;
}

/**
 * Accessible form wrapper: server-validated, errors announced, first invalid
 * field focused, success message in a polite live region.
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  disabled = false,
  onSuccess,
  encType,
  demoPreview = false,
  "aria-label": ariaLabel,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  disabled?: boolean;
  onSuccess?: () => void;
  encType?: "multipart/form-data";
  /** In the demo, let people type and see live answers; only saving is turned off. */
  demoPreview?: boolean;
  "aria-label"?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const demo = useContext(DemoCtx);
  const submitDisabled = disabled || demo;
  disabled = disabled || (demo && !demoPreview);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    } else if (state.fieldErrors) {
      const first = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.at]);
  return (
    <FormCtx.Provider value={{ state, disabled, submitDisabled }}>
      <form ref={ref} action={formAction} className={className} noValidate encType={encType} aria-label={ariaLabel}>
        <fieldset disabled={disabled} className="contents">
          {children}
        </fieldset>
        <FormMessage />
      </form>
    </FormCtx.Provider>
  );
}

export function FormMessage() {
  const { state } = useContext(FormCtx);
  return (
    <div aria-live="polite" className="empty:hidden">
      {state?.ok && state.message && <p className="mt-3 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm text-brand">{state.message}</p>}
      {state && !state.ok && state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/50 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}

function useFieldError(name: string) {
  const { state } = useContext(FormCtx);
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className = "",
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "name"> & {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  wrapperClassName?: string;
};

export function Field({ name, label, hint, wrapperClassName, ...rest }: InputProps) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={wrapperClassName}>
      <input
        id={id}
        name={name}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function MoneyField(props: InputProps) {
  return <Field inputMode="decimal" autoComplete="off" placeholder="0.00" {...props} label={props.label} />;
}

export function SelectField({
  name,
  label,
  hint,
  options,
  wrapperClassName,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name"> & {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  options: Array<{ value: string; label: string }>;
  wrapperClassName?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={wrapperClassName}>
      <select
        id={id}
        name={name}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, hint, defaultChecked, ...rest }: { name: string; label: React.ReactNode; hint?: React.ReactNode; defaultChecked?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type">) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-faint">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function FileField({ name, label, hint, accept }: { name: string; label: string; hint?: string; accept?: string }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        className="input file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-ink"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
    </FieldShell>
  );
}

export function Submit({ children, variant = "primary", className = "", pendingLabel = "Saving…", name, value }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string; pendingLabel?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  const { submitDisabled: disabled } = useContext(FormCtx);
  return (
    <button type="submit" name={name} value={value} className={`btn btn-${variant} ${className}`} disabled={pending || disabled} aria-disabled={pending || disabled}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Plain (non-validated) form for one-click actions like delete. Asks before destructive actions. */
export function QuickAction({
  action,
  fields,
  children,
  confirm,
  variant = "ghost",
  disabled,
  label,
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  children: React.ReactNode;
  confirm?: string;
  variant?: "ghost" | "secondary" | "danger" | "primary";
  disabled?: boolean;
  label?: string;
}) {
  const demo = useContext(DemoCtx);
  disabled = disabled || demo;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <QuickButton variant={variant} disabled={disabled} label={label}>
        {children}
      </QuickButton>
    </form>
  );
}

function QuickButton({ children, variant, disabled, label }: { children: React.ReactNode; variant: string; disabled?: boolean; label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-sm btn-${variant}`} disabled={pending || disabled} aria-label={label}>
      {pending ? "…" : children}
    </button>
  );
}
