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
      className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">{caseRef}</p>
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusBadge status={status} />
          {extraBadge}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {rows.map((row, i) => (
          <div key={i}>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">{row.label}</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
