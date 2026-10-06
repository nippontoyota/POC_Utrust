import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutoFilterSelect } from "@/components/ui/AutoFilterSelect";
import { CaseListCard } from "@/components/CaseListCard";
import { formatINR } from "@/lib/formatCurrency";
import type { Enums } from "@/lib/supabase/database.types";

const inputClass =
  "rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-zinc-950 outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-red-500/10 dark:bg-white/5 dark:text-zinc-100";

const BROKER_ROUTE_STATUSES: Enums<"case_status">[] = [
  "listed_for_brokers",
  "broker_offer_selected",
  "broker_deal_closed",
  "withdrawn",
];

export default async function CoordinatorCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select("id, case_ref, customer_name, vehicle_reg_number, status, customer_expected_price, branches(name)")
    .order("listed_at", { ascending: false });

  if (status) {
    query = query.eq("status", status as Enums<"case_status">);
  }
  if (q) {
    query = query.or(`case_ref.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle_reg_number.ilike.%${q}%`);
  }

  const { data: cases } = await query;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Broker marketplace"
        title="Cases"
        description="Every case a customer has consented to list with brokers, across all branches."
      />

      <form className="flex flex-wrap gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search case ref, customer, or reg number"
            className={`w-full pl-10 ${inputClass}`}
          />
        </div>
        <AutoFilterSelect name="status" defaultValue={status ?? ""} className={inputClass}>
          <option value="">All statuses</option>
          {BROKER_ROUTE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {CASE_STATUS_LABELS[value]}
            </option>
          ))}
        </AutoFilterSelect>
        <Button type="submit">Filter</Button>
        {(q || status) && (
          <Link href="/coordinator/cases" className="self-center text-sm text-zinc-500 hover:underline dark:text-zinc-400">
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
                href={`/coordinator/cases/${c.id}`}
                caseRef={c.case_ref ?? "(draft)"}
                status={c.status}
                rows={[
                  { label: "Branch", value: c.branches?.name ?? "—" },
                  { label: "Customer", value: c.customer_name ?? "—" },
                  { label: "Vehicle", value: c.vehicle_reg_number ?? "—" },
                  { label: "Expected Price", value: formatINR(c.customer_expected_price) },
                ]}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] shadow-[0_20px_60px_rgb(33_25_20/0.07)] md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-left text-xs font-black uppercase text-[var(--muted)]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Case Ref</th>
                  <th className="whitespace-nowrap px-4 py-3">Branch</th>
                  <th className="whitespace-nowrap px-4 py-3">Customer</th>
                  <th className="whitespace-nowrap px-4 py-3">Vehicle</th>
                  <th className="whitespace-nowrap px-4 py-3">Expected Price</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--panel-soft)]">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/coordinator/cases/${c.id}`} className="font-black text-[var(--brand)] hover:underline">
                        {c.case_ref ?? "(draft)"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.branches?.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_name}</td>
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
