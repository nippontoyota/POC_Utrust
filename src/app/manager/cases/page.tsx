import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaseListCard } from "@/components/CaseListCard";
import { formatINR } from "@/lib/formatCurrency";
import type { Enums } from "@/lib/supabase/database.types";

export default async function ManagerCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select("id, case_ref, customer_name, customer_mobile, vehicle_reg_number, status, customer_expected_price, branches(name)")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status as Enums<"case_status">);
  }
  if (q) {
    query = query.or(
      `case_ref.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle_reg_number.ilike.%${q}%`
    );
  }

  const { data: cases } = await query;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">All Cases</h1>

      <form className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search case ref, customer, or reg number"
            className="w-full rounded-md border border-zinc-300 py-2 pl-9 pr-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All statuses</option>
          {Object.entries(CASE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit">Filter</Button>
        {(q || status) && (
          <Link
            href="/manager/cases"
            className="self-center text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Clear
          </Link>
        )}
      </form>

      {!cases || cases.length === 0 ? (
        <EmptyState message="No cases match." />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {cases.map((c) => (
              <CaseListCard
                key={c.id}
                href={`/manager/cases/${c.id}`}
                caseRef={c.case_ref ?? "(draft)"}
                status={c.status}
                rows={[
                  { label: "Branch", value: c.branches?.name ?? "—" },
                  { label: "Customer", value: c.customer_name ?? "—" },
                  { label: "Mobile", value: c.customer_mobile ?? "—" },
                  { label: "Vehicle", value: c.vehicle_reg_number ?? "—" },
                  { label: "Expected Price", value: formatINR(c.customer_expected_price) },
                ]}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Case Ref</th>
                  <th className="whitespace-nowrap px-4 py-3">Branch</th>
                  <th className="whitespace-nowrap px-4 py-3">Customer</th>
                  <th className="whitespace-nowrap px-4 py-3">Mobile</th>
                  <th className="whitespace-nowrap px-4 py-3">Vehicle</th>
                  <th className="whitespace-nowrap px-4 py-3">Expected Price</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/manager/cases/${c.id}`}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {c.case_ref ?? "(draft)"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.branches?.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_mobile}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.vehicle_reg_number}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{formatINR(c.customer_expected_price)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
