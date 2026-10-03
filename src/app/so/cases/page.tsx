import Link from "next/link";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createDraftCase } from "@/lib/actions/cases";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CaseListCard } from "@/components/CaseListCard";
import { formatINR } from "@/lib/formatCurrency";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import type { Enums } from "@/lib/supabase/database.types";

export default async function SoCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select("id, case_ref, customer_name, vehicle_reg_number, status, customer_expected_price, created_at")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status as Enums<"case_status">);
  }

  const { data: cases } = await query;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales cases"
        title="My Cases"
        description="Draft inspections, submitted evaluations, customer decisions, and broker-listed vehicles."
        actions={<form action={createDraftCase}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> New Case
          </Button>
        </form>}
      />

      {status && (
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            Filtered by status: <span className="font-medium text-zinc-900 dark:text-zinc-100">{CASE_STATUS_LABELS[status as Enums<"case_status">] ?? status}</span>
          </span>
          <Link
            href="/so/cases"
            className="inline-flex items-center gap-1 font-black text-[var(--brand)] hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Link>
        </div>
      )}

      {!cases || cases.length === 0 ? (
        <EmptyState
          message={status ? "No cases match this filter." : 'No cases yet. Click "New Case" to get started.'}
        />
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {cases.map((c) => (
              <CaseListCard
                key={c.id}
                href={`/so/cases/${c.id}`}
                caseRef={c.case_ref ?? "(draft)"}
                status={c.status}
                rows={[
                  { label: "Customer", value: c.customer_name ?? "—" },
                  { label: "Vehicle", value: c.vehicle_reg_number ?? "—" },
                  { label: "Expected Price", value: formatINR(c.customer_expected_price) },
                ]}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] shadow-[0_20px_60px_rgb(33_25_20/0.07)] md:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-left text-xs font-black uppercase text-[var(--muted)]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Case Ref</th>
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
                      <Link
                        href={`/so/cases/${c.id}`}
                        className="font-black text-[var(--brand)] hover:underline"
                      >
                        {c.case_ref ?? "(draft)"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.vehicle_reg_number ?? "—"}</td>
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
