import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-3xl font-black leading-tight text-zinc-950 dark:text-zinc-100">{title}</h1>
        {description && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
