import type { ReactNode } from "react";

export const inputClass =
  "mt-1 w-full rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-zinc-950 shadow-inner shadow-black/[0.03] outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-4 focus:ring-red-500/10 disabled:bg-zinc-100 disabled:text-zinc-500 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-900";

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
        {required && <span className="text-red-500 dark:text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}
