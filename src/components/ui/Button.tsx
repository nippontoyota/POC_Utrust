import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-900 dark:disabled:text-blue-400",
  secondary:
    "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:disabled:bg-red-950 dark:disabled:text-red-400",
  ghost:
    "text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
