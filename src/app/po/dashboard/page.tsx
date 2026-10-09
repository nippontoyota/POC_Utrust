import Link from "next/link";
import { ClipboardList, AlertTriangle, LayoutList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isOverdue } from "@/lib/businessDays";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function PoDashboardPage() {
  const supabase = await createClient();

  const [{ count: totalCount }, { data: pendingCases }] = await Promise.all([
    supabase.from("cases").select("id", { count: "exact", head: true }).neq("status", "draft"),
    supabase.from("cases").select("id, submitted_at, evaluation_started_at").eq("status", "pending_evaluation"),
  ]);

  const pendingCount = pendingCases?.filter(c => !c.evaluation_started_at).length ?? 0;
  const inProgressCount = pendingCases?.filter(c => c.evaluation_started_at).length ?? 0;
  const overdueCount = pendingCases?.filter((c) => isOverdue(c.submitted_at, 2)).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Purchase desk"
        title="Dashboard"
        description="Start evaluations, keep overdue work visible, and return offer prices to the sales team."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard
          label="Awaiting your evaluation"
          value={pendingCount}
          tone={pendingCount > 0 ? "accent" : "default"}
          icon={ClipboardList}
          href="/po/cases?evaluation=awaiting"
        />
        <StatCard
          label="Overdue (>2 business days)"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "default"}
          icon={AlertTriangle}
          href="/po/cases?overdue=1"
        />
        <StatCard label="Total assigned cases" value={totalCount ?? 0} icon={LayoutList} href="/po/cases" />
        <StatCard label="Evaluations in progress" value={inProgressCount} icon={ClipboardList} href="/po/cases?evaluation=in_progress" />
      </div>

      <Link
        href="/po/cases"
        className="inline-block text-sm font-black text-[var(--brand)] hover:underline"
      >
        View all assigned cases &rarr;
      </Link>
    </div>
  );
}
