import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

export function EmptyState({
  message,
  icon: Icon = Inbox,
}: {
  message: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[1.35rem] border border-dashed border-[var(--line)] bg-[var(--panel)] p-10 text-center shadow-[0_20px_60px_rgb(33_25_20/0.06)]">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-red-50 text-[var(--brand)] dark:bg-red-950/40">
        <Icon className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <p className="max-w-sm text-sm font-medium text-[var(--muted)]">{message}</p>
    </div>
  );
}
