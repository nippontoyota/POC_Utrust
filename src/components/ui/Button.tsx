import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--brand)] text-white shadow-[0_14px_30px_rgb(226_61_47/0.22)] hover:bg-[var(--brand-strong)] disabled:bg-red-200 disabled:text-red-500 dark:shadow-none dark:text-black dark:disabled:bg-red-950 dark:disabled:text-red-300",
  secondary:
    "border border-[var(--line)] bg-[var(--panel)] text-zinc-800 shadow-sm hover:bg-[var(--panel-soft)] disabled:opacity-50 dark:text-zinc-100",
  destructive:
    "bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:disabled:bg-red-950 dark:disabled:text-red-400",
  ghost:
    "text-zinc-700 hover:bg-black/5 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-white/10",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
