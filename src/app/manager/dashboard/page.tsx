import { Fragment } from "react";
import Link from "next/link";
import { LayoutList, AlertTriangle, CheckCircle2, Wallet, Timer, BadgeCheck, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { formatINR } from "@/lib/formatCurrency";
import { isOverdue, daysSince, isPastDeadline } from "@/lib/businessDays";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Enums } from "@/lib/supabase/database.types";
import type { BrokerReport } from "@/lib/broker";
import type { PoManagerSummary, PoManagerPoRow } from "@/lib/poManager";
import { AutoRefresh } from "@/components/broker/Refresh";
import { BrokerLoadError } from "@/components/broker/BrokerLoadError";

type CaseStatus = Enums<"case_status">;

export default async function ManagerDashboardPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  if (profile?.role === "po_manager") {
    const [{ data, error }, { data: brokerData, error: brokerError }] = await Promise.all([
      supabase.rpc("po_manager_summary", {}),
      supabase.rpc("broker_report", {}),
    ]);
    const summary = data as unknown as PoManagerSummary | null;
    const brokerReport = brokerData as unknown as BrokerReport | null;
    const overdueByPo = new Map<string, number>();
    let overdueCount = 0;
    let notStartedCount = 0;
    let inProgressCount = 0;
    let oldestPending: { days: number; branchName: string } | null = null;
    for (const c of summary?.pending_cases ?? []) {
      if (isOverdue(c.submitted_at, 2)) {
        overdueCount += 1;
        overdueByPo.set(c.po_id, (overdueByPo.get(c.po_id) ?? 0) + 1);
      }
      if (c.evaluation_started_at) {
        inProgressCount += 1;
      } else {
        notStartedCount += 1;
      }
      if (c.submitted_at) {
        const days = daysSince(c.submitted_at);
        if (!oldestPending || days > oldestPending.days) {
          oldestPending = { days, branchName: c.branch_name };
        }
      }
    }

    const branchTotals = new Map<string, number>();
    for (const po of summary?.pos ?? []) {
      branchTotals.set(po.branch_name, (branchTotals.get(po.branch_name) ?? 0) + po.assigned_total);
    }
    const branchDistribution = [...branchTotals.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
    const totalDistributed = branchDistribution.reduce((sum, [, count]) => sum + count, 0);
    const BRANCH_COLORS = ["bg-blue-500", "bg-violet-500", "bg-teal-500", "bg-indigo-500", "bg-fuchsia-500", "bg-slate-500"];

    const sortedPos = [...(summary?.pos ?? [])].sort((a, b) => {
      const overdueDiff = (overdueByPo.get(b.id) ?? 0) - (overdueByPo.get(a.id) ?? 0);
      if (overdueDiff !== 0) return overdueDiff;
      return b.pending - a.pending;
    });
    const posByBranch = new Map<string, PoManagerPoRow[]>();
    for (const po of sortedPos) {
      const list = posByBranch.get(po.branch_name) ?? [];
      list.push(po);
      posByBranch.set(po.branch_name, list);
    }
    const branchGroups = [...posByBranch.entries()].sort((a, b) => a[0].localeCompare(b[0]));

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
            footer={
              summary?.pending_cases.length
                ? `${notStartedCount} not started · ${inProgressCount} in evaluation`
                : undefined
            }
          />
          <StatCard
            label="Overdue (>2 business days)"
            value={overdueCount}
            tone={overdueCount > 0 ? "danger" : "default"}
            icon={AlertTriangle}
            href="/manager/cases?status=pending_evaluation"
          />
          <StatCard label="Evaluated to date" value={summary?.evaluated_total ?? 0} icon={CheckCircle2} />
          <StatCard
            label="Closed deals"
            value={summary?.closed_total ?? 0}
            tone="success"
            icon={BadgeCheck}
            href="/manager/cases?status=closed"
          />
        </div>

        {brokerError && <BrokerLoadError error={brokerError} />}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
          <StatCard label="Broker closed deals" value={brokerReport?.completed ?? "Unavailable"} icon={CheckCircle2} href="/manager/marketplace" />
          <StatCard label="Broker deal value" value={brokerReport ? formatINR(brokerReport.deal_value) : "Unavailable"} icon={Wallet} href="/manager/marketplace" />
          <StatCard label="Expiring broker holds" value={brokerReport?.expiring ?? "Unavailable"} icon={AlertTriangle} href="/manager/marketplace" />
        </div>

        {oldestPending && (
          <Link
            href="/manager/cases?status=pending_evaluation"
            className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <Clock className="size-4 shrink-0" strokeWidth={1.75} />
            <span>
              Oldest pending case: <strong>{Math.max(1, Math.floor(oldestPending.days))} day{Math.floor(oldestPending.days) === 1 ? "" : "s"}</strong> old at{" "}
              {oldestPending.branchName}
            </span>
          </Link>
        )}

        {branchDistribution.length > 1 && (
          <Card className="space-y-3">
            <CardTitle>Case distribution by branch</CardTitle>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
              {branchDistribution.map(([branchName, count], i) => (
                <div
                  key={branchName}
                  className={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                  style={{ width: `${(count / totalDistributed) * 100}%` }}
                  title={`${branchName}: ${count}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
              {branchDistribution.map(([branchName, count], i) => (
                <span key={branchName} className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${BRANCH_COLORS[i % BRANCH_COLORS.length]}`} />
                  {branchName} ({count})
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card className="space-y-3">
          <CardTitle>Purchase Officers</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs font-black uppercase text-[var(--muted)]">
                <tr>
                  {["PO", "Branch", "Assigned", "Pending", "Overdue", "Evaluated", "Load"].map((t) => (
                    <th key={t} className="px-2 py-3 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branchGroups.map(([branchName, poRows]) => (
                  <Fragment key={branchName}>
                    {branchGroups.length > 1 && (
                      <tr>
                        <td colSpan={7} className="px-2 pb-1 pt-4 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                          {branchName}
                        </td>
                      </tr>
                    )}
                    {poRows.map((po) => {
                      const overdue = overdueByPo.get(po.id) ?? 0;
                      const other = Math.max(0, po.assigned_total - po.pending - po.evaluated);
                      return (
                        <tr
                          key={po.id}
                          className={`border-b border-zinc-100 dark:border-zinc-800 ${overdue > 0 ? "border-l-2 border-l-red-500" : ""}`}
                        >
                          <td className="px-2 py-3">
                            {po.name} <span className="text-xs text-zinc-500">({po.employee_id})</span>
                            {!po.is_active && <span className="ml-1 text-xs text-red-600 dark:text-red-400">inactive</span>}
                          </td>
                          <td className="px-2 py-3 text-zinc-700 dark:text-zinc-300">{po.branch_name}</td>
                          <td className="px-2 py-3 tabular-nums">{po.assigned_total}</td>
                          <td className="px-2 py-3 tabular-nums">{po.pending}</td>
                          <td className="px-2 py-3 tabular-nums">
                            {overdue > 0 ? (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                                {overdue}
                              </span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="px-2 py-3 tabular-nums">{po.evaluated}</td>
                          <td className="px-2 py-3">
                            {po.assigned_total > 0 && (
                              <div
                                className="flex h-2 w-24 overflow-hidden rounded-full bg-[var(--panel-soft)]"
                                title={`${po.pending} pending · ${po.evaluated} evaluated · ${other} other`}
                              >
                                <div className="bg-amber-400" style={{ width: `${(po.pending / po.assigned_total) * 100}%` }} />
                                <div className="bg-green-500" style={{ width: `${(po.evaluated / po.assigned_total) * 100}%` }} />
                                <div className="bg-zinc-300 dark:bg-zinc-700" style={{ width: `${(other / po.assigned_total) * 100}%` }} />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
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
    .select("id, status, submitted_at, customer_decision_at, closed_at, customer_expected_price, offer_deadline_at, final_price, case_offers(offer_price,submitted_at)")
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
    return sum + (c.final_price ?? offer?.offer_price ?? 0);
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

  const overdueDecisions = rows.filter(
    (c) => c.status === "pending_customer_decision" && isPastDeadline(c.offer_deadline_at)
  ).length;

  const directRouteStatuses: CaseStatus[] = [
    "pending_evaluation",
    "pending_customer_decision",
    "purchase_completion_pending",
    "closed",
    "cancelled",
    "withdrawn",
    "rejected_not_listed",
    "no_customer_decision",
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
        <StatCard
          label="Avg. customer decision time"
          value={customerTurnarounds.length ? `${(customerTurnarounds.reduce((a,b) => a+b,0) / customerTurnarounds.length).toFixed(1)} hrs` : "N/A"}
          icon={Timer}
          href="/manager/cases?status=pending_customer_decision"
        />
        <StatCard
          label="Overdue decisions (>72h)"
          value={overdueDecisions}
          tone={overdueDecisions > 0 ? "danger" : "default"}
          icon={AlertTriangle}
          href="/manager/cases?status=pending_customer_decision"
        />
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
