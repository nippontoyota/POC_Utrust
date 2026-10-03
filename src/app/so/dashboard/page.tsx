import Link from "next/link";
import { FileText, Clock, LayoutList, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createDraftCase } from "@/lib/actions/cases";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutoRefresh } from "@/components/broker/Refresh";
import { BrokerLoadError } from "@/components/broker/BrokerLoadError";

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
      <PageHeader
        eyebrow="Sales cockpit"
        title="Dashboard"
        description="Create cases, monitor customer decisions, and move rejected vehicles into the broker marketplace."
        actions={<form action={createDraftCase}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> New Case
          </Button>
        </form>}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
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
        <StatCard label="Open broker cases" value={brokerCounts?.listed ?? "Unavailable"} icon={LayoutList} href="/so/cases" />
        <StatCard label="Active broker reservations" value={brokerCounts?.reserved ?? "Unavailable"} icon={Clock} href="/so/cases" />
        <StatCard label="Broker cases awaiting selection" value={brokerCounts?.awaiting_selection ?? "Unavailable"} icon={FileText} href="/so/cases" />
        <StatCard label="Broker holds expiring within 2 hours" value={brokerCounts?.expiring ?? "Unavailable"} icon={Clock} href="/so/cases" />
      </div>
      {brokerError && <BrokerLoadError error={brokerError} />}

      <Link
        href="/so/cases"
        className="inline-block text-sm font-black text-[var(--brand)] hover:underline"
      >
        View all cases &rarr;
      </Link>
    </div>
  );
}
