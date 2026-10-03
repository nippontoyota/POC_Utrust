import Link from "next/link";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaseListCard } from "@/components/CaseListCard";
import { formatINR } from "@/lib/formatCurrency";
import { isOverdue } from "@/lib/businessDays";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import type { Enums } from "@/lib/supabase/database.types";

export default async function PoCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; overdue?: string }>;
}) {
  const { status, overdue: overdueFilter } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select("id, case_ref, customer_name, vehicle_reg_number, status, customer_expected_price, submitted_at, evaluation_started_at")
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (overdueFilter) {
    query = query.eq("status", "pending_evaluation");
  } else if (status) {
    query = query.eq("status", status as Enums<"case_status">);
  }

  const { data: allCases } = await query;
  const cases = overdueFilter
    ? allCases?.filter((c) => isOverdue(c.submitted_at, 2))
    : allCases;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Assigned Cases</h1>

      {(status || overdueFilter) && (
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            Filtered by:{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {overdueFilter ? "Overdue (>2 business days)" : CASE_STATUS_LABELS[status as Enums<"case_status">] ?? status}
            </span>
          </span>
          <Link
            href="/po/cases"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Link>
        </div>
      )}

      {!cases || cases.length === 0 ? (
        <EmptyState message={status || overdueFilter ? "No cases match this filter." : "No cases assigned to you yet."} />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {cases.map((c) => {
              const overdue = c.status === "pending_evaluation" && isOverdue(c.submitted_at, 2);
              return (
                <CaseListCard
                  key={c.id}
                  href={`/po/cases/${c.id}`}
                  caseRef={c.case_ref ?? ""}
                  status={c.status}
                  extraBadge={
                    overdue ? (
                      <span className="inline-block rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                        Overdue
                      </span>
                    ) : undefined
                  }
                  rows={[
                    { label: "Customer", value: c.customer_name ?? "—" },
                    { label: "Vehicle", value: c.vehicle_reg_number ?? "—" },
                    { label: "Expected Price", value: formatINR(c.customer_expected_price) },
                    ...(c.status === "pending_evaluation" ? [{ label: "Evaluation", value: c.evaluation_started_at ? "In progress" : "Awaiting start" }] : []),
                  ]}
                />
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Case Ref</th>
                  <th className="whitespace-nowrap px-4 py-3">Customer</th>
                  <th className="whitespace-nowrap px-4 py-3">Vehicle</th>
                  <th className="whitespace-nowrap px-4 py-3">Expected Price</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {cases.map((c) => {
                  const overdue = c.status === "pending_evaluation" && isOverdue(c.submitted_at, 2);
                  return (
                    <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/po/cases/${c.id}`}
                          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {c.case_ref}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.vehicle_reg_number}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{formatINR(c.customer_expected_price)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={c.status} />
                          {c.status === "pending_evaluation" && c.evaluation_started_at && <span className="text-xs text-zinc-500">In progress</span>}
                          {overdue && (
                            <span className="inline-block rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
