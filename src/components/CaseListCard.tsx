import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Enums } from "@/lib/supabase/database.types";

export function CaseListCard({
  href,
  caseRef,
  status,
  rows,
  extraBadge,
}: {
  href: string;
  caseRef: string;
  status: Enums<"case_status">;
  rows: { label: string; value: ReactNode }[];
  extraBadge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_45px_rgb(33_25_20/0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)]"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="font-black text-zinc-950 dark:text-zinc-100">{caseRef}</p>
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusBadge status={status} />
          {extraBadge}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        {rows.map((row, i) => (
          <div key={i}>
            <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{row.label}</dt>
            <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
