import Link from "next/link";
import { ClipboardList, AlertTriangle, LayoutList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isOverdue } from "@/lib/businessDays";
import { StatCard } from "@/components/ui/StatCard";

export default async function PoDashboardPage() {
  const supabase = await createClient();

  const [{ count: totalCount }, { data: pendingCases }] = await Promise.all([
    supabase.from("cases").select("id", { count: "exact", head: true }),
    supabase.from("cases").select("id, submitted_at, evaluation_started_at").eq("status", "pending_evaluation"),
  ]);

  const pendingCount = pendingCases?.filter(c => !c.evaluation_started_at).length ?? 0;
  const inProgressCount = pendingCases?.filter(c => c.evaluation_started_at).length ?? 0;
  const overdueCount = pendingCases?.filter((c) => isOverdue(c.submitted_at, 2)).length ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting your evaluation"
          value={pendingCount}
          tone={pendingCount > 0 ? "accent" : "default"}
          icon={ClipboardList}
          href="/po/cases?status=pending_evaluation"
        />
        <StatCard
          label="Overdue (>2 business days)"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "default"}
          icon={AlertTriangle}
          href="/po/cases?overdue=1"
        />
        <StatCard label="Total assigned cases" value={totalCount ?? 0} icon={LayoutList} href="/po/cases" />
        <StatCard label="Evaluations in progress" value={inProgressCount} icon={ClipboardList} href="/po/cases?status=pending_evaluation" />
      </div>

      <Link
        href="/po/cases"
        className="inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        View all assigned cases &rarr;
      </Link>
    </div>
  );
}
