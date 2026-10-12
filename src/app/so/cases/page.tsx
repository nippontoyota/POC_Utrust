import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createDraftCase } from "@/lib/actions/cases";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutoFilterSelect } from "@/components/ui/AutoFilterSelect";
import { CaseListCard } from "@/components/CaseListCard";
import { formatINR } from "@/lib/formatCurrency";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { vehicleLabel } from "@/lib/caseRef";
import type { Enums } from "@/lib/supabase/database.types";

const inputClass =
  "rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-zinc-950 outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-red-500/10 dark:bg-white/5 dark:text-zinc-100";

type BrokerFilter = "open" | "reserved" | "expiring";
type ReservationQuery = PromiseLike<{ data: { case_id: string | null }[] | null }> & {
  eq(column: string, value: string): ReservationQuery;
  gt(column: string, value: string): ReservationQuery;
  lte(column: string, value: string): ReservationQuery;
};
type ReservationClient = {
  from(table: "broker_reservations"): {
    select(columns: "case_id"): ReservationQuery;
  };
};

async function getActiveReservationCaseIds(
  supabase: unknown,
  expiringOnly = false,
) {
  const now = new Date();
  let query = (supabase as ReservationClient)
    .from("broker_reservations")
    .select("case_id")
    .eq("status", "active")
    .gt("expires_at", now.toISOString());

  if (expiringOnly) {
    query = query.lte(
      "expires_at",
      new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    );
  }

  const { data } = await query;
  return [...new Set((data ?? []).flatMap((r) => (r.case_id ? [r.case_id] : [])))];
}

export default async function SoCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; broker?: string; q?: string }>;
}) {
  const { status, broker: brokerParam, q } = await searchParams;
  const broker = ["open", "reserved", "expiring"].includes(brokerParam ?? "")
    ? (brokerParam as BrokerFilter)
    : null;
  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select("id, case_ref, customer_name, vehicle_reg_number, make, model, variant, status, customer_expected_price, created_at")
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`customer_name.ilike.%${q}%,vehicle_reg_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`);
  }

  if (broker === "open") {
    const activeReservationCaseIds = await getActiveReservationCaseIds(supabase);
    query = query
      .in("status", ["listed_for_brokers", "broker_offer_selected"])
      .eq("broker_consent", true);
    if (activeReservationCaseIds.length) {
      query = query.not("id", "in", `(${activeReservationCaseIds.join(",")})`);
    }
  } else if (broker === "reserved" || broker === "expiring") {
    const activeReservationCaseIds = await getActiveReservationCaseIds(
      supabase,
      broker === "expiring",
    );
    query = activeReservationCaseIds.length
      ? query.in("id", activeReservationCaseIds)
      : query.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (status) {
    query = query.eq("status", status as Enums<"case_status">);
  }

  const { data: cases } = await query;
  const brokerFilterLabel = {
    open: "Open broker cases",
    reserved: "Active broker reservations",
    expiring: "Broker holds expiring within 2 hours",
  }[broker ?? "open"];
  const filterLabel =
    broker
      ? brokerFilterLabel
      : CASE_STATUS_LABELS[status as Enums<"case_status">] ?? status;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales cases"
        title="My Cases"
        description="Submitted evaluations, customer decisions, and broker-listed vehicles."
        actions={<form action={createDraftCase}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> New Case
          </Button>
        </form>}
      />

      <form className="flex flex-wrap gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search customer, vehicle, or reg number"
            className={`w-full pl-10 ${inputClass}`}
          />
        </div>
        <AutoFilterSelect name="status" defaultValue={status ?? ""} className={inputClass}>
          <option value="">All statuses</option>
          {Object.entries(CASE_STATUS_LABELS).filter(([value]) => value !== "draft").map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </AutoFilterSelect>
        <Button type="submit">Filter</Button>
        {(q || status) && (
          <Link href="/so/cases" className="self-center text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            Clear
          </Link>
        )}
      </form>

      {(status || broker) && (
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            Filtered by: <span className="font-medium text-zinc-900 dark:text-zinc-100">{filterLabel}</span>
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
          message={status || broker ? "No cases match this filter." : 'No cases yet. Click "New Case" to get started.'}
        />
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {cases.map((c) => (
              <CaseListCard
                key={c.id}
                href={`/so/cases/${c.id}`}
                title={c.case_ref ? `${vehicleLabel(c.make, c.model, c.variant)}${c.vehicle_reg_number ? ` — ${c.vehicle_reg_number}` : ""}` : "New Case (Draft)"}
                status={c.status}
                rows={[
                  { label: "Customer", value: c.customer_name ?? "—" },
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
                  <th className="whitespace-nowrap px-4 py-3">Vehicle</th>
                  <th className="whitespace-nowrap px-4 py-3">Customer</th>
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
                        {c.case_ref ? `${vehicleLabel(c.make, c.model, c.variant)}${c.vehicle_reg_number ? ` — ${c.vehicle_reg_number}` : ""}` : "New Case (Draft)"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_name ?? "—"}</td>
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
