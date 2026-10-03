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
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <Icon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" strokeWidth={1.5} />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
    </div>
  );
}
