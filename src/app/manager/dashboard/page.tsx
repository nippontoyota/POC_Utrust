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
import { AutoRefresh } from "@/components/broker/Refresh";
import { BrokerLoadError } from "@/components/broker/BrokerLoadError";

type CaseStatus = Enums<"case_status">;

export default async function ManagerDashboardPage() {
  const supabase = await createClient();

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

  const { data: brokerData, error: brokerError } = await supabase.rpc("broker_report", {});
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

  const statusOrder: CaseStatus[] = [
    "pending_evaluation",
    "pending_customer_decision",
    "purchase_completion_pending",
    "closed",
    "cancelled",
    "withdrawn",
    "rejected_not_listed",
    "listed_for_brokers",
    "broker_offer_selected",
    "no_broker_interest",
    "broker_deal_closed",
  ];

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PageHeader
        eyebrow="Management overview"
        title="Dashboard"
        description="Track evaluation health, direct purchases, broker closures, and inventory movement."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard label="Total active + closed cases" value={rows.length} icon={LayoutList} />
        <StatCard
          label="Overdue evaluations"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "default"}
          icon={AlertTriangle}
        />
        <StatCard label="Direct closed deals" value={closedCases.length} icon={CheckCircle2} />
        <StatCard label="Direct deal value" value={formatINR(closedValue)} icon={Wallet} />
        <StatCard
          label="Avg. PO turnaround"
          value={avgEvaluationHours !== null ? `${avgEvaluationHours.toFixed(1)} hrs` : "—"}
          icon={Timer}
        />
      </div>
      {brokerError && <BrokerLoadError error={brokerError} />}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard label="Broker closed deals" value={brokerReport?.completed ?? "Unavailable"} icon={CheckCircle2} href="/manager/marketplace" />
        <StatCard label="Broker deal value" value={brokerReport ? formatINR(brokerReport.deal_value) : "Unavailable"} icon={Wallet} href="/manager/marketplace" />
        <StatCard label="Expiring broker holds" value={brokerReport?.expiring ?? "Unavailable"} icon={AlertTriangle} href="/manager/marketplace" />
        <StatCard label="Avg. customer decision time" value={customerTurnarounds.length ? `${(customerTurnarounds.reduce((a,b) => a+b,0) / customerTurnarounds.length).toFixed(1)} hrs` : "N/A"} icon={Timer} />
      </div>

      <Card>
        <CardTitle>Cases by Status</CardTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {statusOrder.map((status) => (
            <div
              key={status}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3"
          >
              <span className="text-sm font-medium text-[var(--muted)]">{CASE_STATUS_LABELS[status]}</span>
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {statusCounts[status] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
