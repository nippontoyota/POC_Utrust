import type { ReactNode } from "react";

export const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500";

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
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="text-red-500 dark:text-red-400"> *</span>}
      </label>
      {children}
    </div>
  );
}
