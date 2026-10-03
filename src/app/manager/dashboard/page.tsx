import { LayoutList, AlertTriangle, CheckCircle2, Wallet, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { formatINR } from "@/lib/formatCurrency";
import { isOverdue } from "@/lib/businessDays";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import type { Enums } from "@/lib/supabase/database.types";

type CaseStatus = Enums<"case_status">;

export default async function ManagerDashboardPage() {
  const supabase = await createClient();

  const { data: cases } = await supabase
    .from("cases")
    .select("id, status, submitted_at, customer_decision_at, closed_at, customer_expected_price, case_offers(offer_price)")
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

  const evaluationTurnarounds = rows
    .filter((c) => c.submitted_at && c.customer_decision_at)
    .map((c) => (new Date(c.customer_decision_at!).getTime() - new Date(c.submitted_at!).getTime()) / (1000 * 60 * 60));
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
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total active + closed cases" value={rows.length} icon={LayoutList} />
        <StatCard
          label="Overdue evaluations"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "default"}
          icon={AlertTriangle}
        />
        <StatCard label="Closed deals" value={closedCases.length} icon={CheckCircle2} />
        <StatCard label="Closed deal value" value={formatINR(closedValue)} icon={Wallet} />
        <StatCard
          label="Avg. evaluation-to-decision time"
          value={avgEvaluationHours !== null ? `${avgEvaluationHours.toFixed(1)} hrs` : "—"}
          icon={Timer}
        />
      </div>

      <Card>
        <CardTitle>Cases by Status</CardTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {statusOrder.map((status) => (
            <div
              key={status}
              className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 dark:border-zinc-800"
            >
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{CASE_STATUS_LABELS[status]}</span>
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
