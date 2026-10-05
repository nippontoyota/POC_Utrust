import Link from "next/link";
import { LayoutList, AlertTriangle, CheckCircle2, Wallet, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { formatINR } from "@/lib/formatCurrency";
import { isOverdue } from "@/lib/businessDays";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Enums } from "@/lib/supabase/database.types";
import type { BrokerReport } from "@/lib/broker";
import type { PoManagerSummary } from "@/lib/poManager";
import { AutoRefresh } from "@/components/broker/Refresh";
import { BrokerLoadError } from "@/components/broker/BrokerLoadError";

type CaseStatus = Enums<"case_status">;

export default async function ManagerDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();

  if (profile?.role === "po_manager") {
    const { data, error } = await supabase.rpc("po_manager_summary", {});
    const summary = data as unknown as PoManagerSummary | null;
    const overdueByPo = new Map<string, number>();
    let overdueCount = 0;
    for (const c of summary?.pending_cases ?? []) {
      if (isOverdue(c.submitted_at, 2)) {
        overdueCount += 1;
        overdueByPo.set(c.po_id, (overdueByPo.get(c.po_id) ?? 0) + 1);
      }
    }

    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="PO oversight"
          title="Dashboard"
          description="Track every Purchase Officer's workload, pending evaluations, and turnaround across all branches."
        />
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Could not load summary: {error.message}
          </p>
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
          <StatCard label="Total assigned cases" value={summary?.total_cases ?? 0} icon={LayoutList} href="/manager/cases" />
          <StatCard
            label="Awaiting evaluation"
            value={summary?.pending_cases.length ?? 0}
            icon={Timer}
            href="/manager/cases?status=pending_evaluation"
          />
          <StatCard
            label="Overdue (>2 business days)"
            value={overdueCount}
            tone={overdueCount > 0 ? "danger" : "default"}
            icon={AlertTriangle}
            href="/manager/cases?status=pending_evaluation"
          />
          <StatCard label="Evaluated to date" value={summary?.evaluated_total ?? 0} icon={CheckCircle2} />
        </div>

        <Card className="space-y-3">
          <CardTitle>Purchase Officers</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs font-black uppercase text-[var(--muted)]">
                <tr>
                  {["PO", "Branch", "Assigned", "Pending", "Overdue", "Evaluated"].map((t) => (
                    <th key={t} className="px-2 py-3 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary?.pos.map((po) => (
                  <tr key={po.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-3">
                      {po.name} <span className="text-xs text-zinc-500">({po.employee_id})</span>
                      {!po.is_active && <span className="ml-1 text-xs text-red-600 dark:text-red-400">inactive</span>}
                    </td>
                    <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">{po.branch_name}</td>
                    <td className="px-2 py-3 tabular-nums">{po.assigned_total}</td>
                    <td className="px-2 py-3 tabular-nums">{po.pending}</td>
                    <td className="px-2 py-3 tabular-nums">{overdueByPo.get(po.id) ?? 0}</td>
                    <td className="px-2 py-3 tabular-nums">{po.evaluated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!summary?.pos.length && <p className="text-sm text-zinc-500 dark:text-zinc-400">No Purchase Officers found.</p>}
        </Card>
      </div>
    );
  }

  const { data: cases } = await supabase
    .from("cases")
    .select("id, status, submitted_at, customer_decision_at, closed_at, customer_expected_price, case_offers(offer_price,submitted_at)")
    .neq("status", "draft");

  const rows = cases ?? [];

  const statusCounts: Partial<Record<CaseStatus, number>> = {};
  for (const c of rows) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  }

  const overdueCount = rows.filter((c) => c.status === "pending_evaluation" && isOverdue(c.submitted_at, 2)).length;

  const closedCases = rows.filter((c) => c.status === "closed");
  const closedValue = closedCases.reduce((sum, c) => {
    const offer = Array.isArray(c.case_offers) ? c.case_offers[0] : c.case_offers;
    return sum + (offer?.offer_price ?? 0);
  }, 0);

  const isClusterManager = profile?.role === "cluster_manager";
  const { data: brokerData, error: brokerError } = isClusterManager
    ? await supabase.rpc("broker_report", {})
    : { data: null, error: null };
  const brokerReport = brokerData as unknown as BrokerReport | null;
  const evaluationTurnarounds = rows.flatMap(c => {
    const offer = Array.isArray(c.case_offers) ? c.case_offers[0] : c.case_offers;
    return c.submitted_at && offer?.submitted_at ? [(Date.parse(offer.submitted_at) - Date.parse(c.submitted_at)) / 3600000] : [];
  });
  const customerTurnarounds = rows.flatMap(c => {
    const offer = Array.isArray(c.case_offers) ? c.case_offers[0] : c.case_offers;
    return c.customer_decision_at && offer?.submitted_at ? [(Date.parse(c.customer_decision_at) - Date.parse(offer.submitted_at)) / 3600000] : [];
  });
  const avgEvaluationHours =
    evaluationTurnarounds.length > 0
      ? evaluationTurnarounds.reduce((a, b) => a + b, 0) / evaluationTurnarounds.length
      : null;

  const directRouteStatuses: CaseStatus[] = [
    "pending_evaluation",
    "pending_customer_decision",
    "purchase_completion_pending",
    "closed",
    "cancelled",
    "withdrawn",
    "rejected_not_listed",
  ];
  const brokerRouteStatuses: CaseStatus[] = [
    "listed_for_brokers",
    "broker_offer_selected",
    "no_broker_interest",
    "broker_deal_closed",
  ];
  // Sales Manager has no broker reporting/analytics anywhere else in their
  // view, so the broker-route statuses are dropped here too, not just hidden
  // on the stat cards above. Cluster Manager keeps the full breakdown.
  const statusOrder: CaseStatus[] = isClusterManager
    ? [...directRouteStatuses, ...brokerRouteStatuses]
    : directRouteStatuses;

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PageHeader
        eyebrow="Management overview"
        title="Dashboard"
        description="Track evaluation health, direct purchases, broker closures, and inventory movement."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard label="Total active + closed cases" value={rows.length} icon={LayoutList} href="/manager/cases" />
        <StatCard
          label="Overdue evaluations"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "default"}
          icon={AlertTriangle}
          href="/manager/cases?status=pending_evaluation"
        />
        <StatCard label="Direct closed deals" value={closedCases.length} icon={CheckCircle2} href="/manager/cases?status=closed" />
        <StatCard label="Direct deal value" value={formatINR(closedValue)} icon={Wallet} href="/manager/cases?status=closed" />
        <StatCard
          label="Avg. PO turnaround"
          value={avgEvaluationHours !== null ? `${avgEvaluationHours.toFixed(1)} hrs` : "—"}
          icon={Timer}
          href="/manager/cases"
        />
      </div>
      {isClusterManager && brokerError && <BrokerLoadError error={brokerError} />}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        {isClusterManager && (
          <>
            <StatCard label="Broker closed deals" value={brokerReport?.completed ?? "Unavailable"} icon={CheckCircle2} href="/manager/marketplace" />
            <StatCard label="Broker deal value" value={brokerReport ? formatINR(brokerReport.deal_value) : "Unavailable"} icon={Wallet} href="/manager/marketplace" />
            <StatCard label="Expiring broker holds" value={brokerReport?.expiring ?? "Unavailable"} icon={AlertTriangle} href="/manager/marketplace" />
          </>
        )}
        <StatCard label="Avg. customer decision time" value={customerTurnarounds.length ? `${(customerTurnarounds.reduce((a,b) => a+b,0) / customerTurnarounds.length).toFixed(1)} hrs` : "N/A"} icon={Timer} href="/manager/cases?status=pending_customer_decision" />
      </div>

      <Card>
        <CardTitle>Cases by Status</CardTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {statusOrder.map((status) => (
            <Link
              key={status}
              href={`/manager/cases?status=${status}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <span className="text-sm font-medium text-[var(--muted)]">{CASE_STATUS_LABELS[status]}</span>
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {statusCounts[status] ?? 0}
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
