import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Tone = "default" | "accent" | "warning" | "danger" | "success";

const TONE_CLASSES: Record<Tone, string> = {
  default: "border-[var(--line)] bg-[var(--panel)]",
  accent: "border-red-200 bg-red-50/90 dark:border-red-950 dark:bg-red-950/35",
  warning: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  danger: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
  success: "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
};

const ICON_TONE_CLASSES: Record<Tone, string> = {
  default: "bg-black text-white dark:bg-[var(--panel-soft)] dark:text-zinc-100",
  accent: "bg-red-600 text-white dark:bg-red-900 dark:text-red-100",
  warning: "bg-amber-500 text-white dark:bg-amber-900 dark:text-amber-100",
  danger: "bg-red-600 text-white dark:bg-red-900 dark:text-red-100",
  success: "bg-green-600 text-white dark:bg-green-900 dark:text-green-100",
};

export function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
  href,
  footer,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: LucideIcon;
  href?: string;
  footer?: string;
}) {
  const content = (
    <>
      <div className="flex min-h-10 items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium leading-snug text-[var(--muted)]">{label}</p>
        {Icon && (
          <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full ${ICON_TONE_CLASSES[tone]}`}>
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-950 [overflow-wrap:anywhere] dark:text-zinc-50">{value}</p>
      {footer && <p className="mt-1 text-xs text-[var(--muted)]">{footer}</p>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`block min-w-0 rounded-[1.35rem] border p-5 shadow-[0_20px_60px_rgb(33_25_20/0.07)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)] hover:shadow-[0_22px_70px_rgb(226_61_47/0.14)] dark:shadow-none dark:hover:shadow-none ${TONE_CLASSES[tone]}`}
      >
        {content}
      </Link>
    );
  }

  return <div className={`min-w-0 rounded-[1.35rem] border p-5 shadow-[0_20px_60px_rgb(33_25_20/0.07)] dark:shadow-none ${TONE_CLASSES[tone]}`}>{content}</div>;
}
