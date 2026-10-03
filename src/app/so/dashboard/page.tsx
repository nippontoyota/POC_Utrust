import Link from "next/link";
import { FileText, Clock, LayoutList, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createDraftCase } from "@/lib/actions/cases";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { AutoRefresh } from "@/components/broker/Refresh";

export default async function SoDashboardPage() {
  const supabase = await createClient();

  const [{ count: draftCount }, { count: awaitingDecisionCount }, { count: totalCount }, { data: brokerCounts, error: brokerError }] = await Promise.all([
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("status", "pending_customer_decision"),
    supabase.from("cases").select("id", { count: "exact", head: true }),
    supabase.rpc("so_broker_summary", {}),
  ]);

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <form action={createDraftCase}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> New Case
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Draft cases"
          value={draftCount ?? 0}
          icon={FileText}
          href="/so/cases?status=draft"
        />
        <StatCard
          label="Awaiting your action on customer decision"
          value={awaitingDecisionCount ?? 0}
          tone={awaitingDecisionCount ? "accent" : "default"}
          icon={Clock}
          href="/so/cases?status=pending_customer_decision"
        />
        <StatCard label="Total cases" value={totalCount ?? 0} icon={LayoutList} href="/so/cases" />
        <StatCard label="Open broker cases" value={brokerCounts?.listed ?? 0} icon={LayoutList} href="/so/cases" />
        <StatCard label="Active broker reservations" value={brokerCounts?.reserved ?? 0} icon={Clock} href="/so/cases" />
        <StatCard label="Broker cases awaiting selection" value={brokerCounts?.awaiting_selection ?? 0} icon={FileText} href="/so/cases" />
        <StatCard label="Broker holds expiring within 2 hours" value={brokerCounts?.expiring ?? 0} icon={Clock} href="/so/cases" />
      </div>
      {brokerError && <p role="alert" className="text-sm text-red-600">Broker activity: {brokerError.message}</p>}

      <Link
        href="/so/cases"
        className="inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        View all cases &rarr;
      </Link>
    </div>
  );
}
