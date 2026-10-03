import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Tone = "default" | "accent" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  default: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
  accent: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40",
  warning: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  danger: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
};

export function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: LucideIcon;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
        {Icon && <Icon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" strokeWidth={1.75} />}
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-lg border p-5 transition-colors hover:border-blue-300 hover:shadow-sm dark:hover:border-blue-800 ${TONE_CLASSES[tone]}`}
      >
        {content}
      </Link>
    );
  }

  return <div className={`rounded-lg border p-5 ${TONE_CLASSES[tone]}`}>{content}</div>;
}
