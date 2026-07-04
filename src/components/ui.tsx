import React from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none cursor-pointer";
  const styles = {
    primary:
      "bg-gradient-to-r from-accent-600 to-accent-500 text-white shadow-lg shadow-accent-600/25 hover:brightness-110 active:scale-[0.98]",
    ghost:
      "bg-ink-800 text-ink-200 border border-ink-700 hover:bg-ink-700 hover:text-ink-100",
    subtle: "bg-transparent text-ink-300 hover:bg-ink-800 hover:text-ink-100",
    danger:
      "bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function Card({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card p-5 ${className}`} {...props} />;
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-ink-900 border border-ink-700 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 outline-none focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/15 transition-colors";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputCls} resize-none leading-relaxed ${props.className ?? ""}`}
    />
  );
}

export function Select({
  options,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label?: string }[];
}) {
  return (
    <select {...props} className={`${inputCls} appearance-none cursor-pointer ${className}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-ink-900">
          {o.label ?? o.value}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onValue,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onValue: (n: number) => void;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onValue(n);
      }}
      {...props}
      className={`${inputCls} ${props.className ?? ""}`}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-accent-500" : "bg-ink-600"
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </button>
      {label && (
        <span className="text-sm text-ink-200 group-hover:text-ink-100">{label}</span>
      )}
    </label>
  );
}

export function ProgressBar({
  value,
  max,
  indeterminate = false,
}: {
  value: number;
  max: number;
  indeterminate?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
      {indeterminate ? (
        <div className="h-full w-full animate-shimmer" />
      ) : (
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-600 via-accent-400 to-glow transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

export function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
        active
          ? "border-accent-500/60 bg-accent-500/15 text-accent-300"
          : "border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-600 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-8"
      onClick={onClose}
    >
      <div
        className={`card max-h-full overflow-y-auto p-6 ${wide ? "w-[min(1100px,95vw)]" : "w-[min(640px,92vw)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon = "◇",
}: {
  title: string;
  hint?: string;
  icon?: string;
}) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
      <div className="text-3xl text-ink-600">{icon}</div>
      <div className="text-sm font-medium text-ink-300">{title}</div>
      {hint && <div className="max-w-sm text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-xl border border-ink-700/60">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-ink-300 hover:text-ink-100 cursor-pointer"
      >
        {title}
        <span
          className={`text-xs transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
      </button>
      {open && <div className="border-t border-ink-700/60 p-4">{children}</div>}
    </div>
  );
}

export function formatBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(2)} GB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}
