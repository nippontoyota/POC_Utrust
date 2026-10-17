import Link from "next/link";
import { ClipboardList, Users, MapPin, UserCheck, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationOptIn } from "@/components/ui/NotificationOptIn";
import { formatINR } from "@/lib/formatCurrency";
import { vehicleLabel, shortCaseRef } from "@/lib/caseRef";
import type { PtlDashboard } from "@/lib/ptl";

export default async function PtlDashboardPage() {
  const supabase = await createClient();
  const service = createServiceClient();
  const [{ data, error }, { count: brokerQueuePendingCount }] = await Promise.all([
    supabase.rpc("ptl_dashboard", {}),
    service
      .from("cases")
      .select("id", { count: "exact", head: true })
      .or("status.in.(listed_for_brokers,broker_offer_selected),broker_consent.eq.true")
      .is("broker_broadcast_at", null),
  ]);
  const dashboard = data as unknown as PtlDashboard | null;

  const unassigned = dashboard?.unassigned ?? [];
  const workload = dashboard?.po_workload ?? [];
  const branches = dashboard?.branches ?? [];

  const byBranch = new Map<string, typeof workload>();
  for (const po of workload) {
    const list = byBranch.get(po.branch_name) ?? [];
    list.push(po);
    byBranch.set(po.branch_name, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assignment desk"
        title="Dashboard"
        description="Pick up newly submitted cases and hand each one to whichever PO in your branches is free."
        actions={<NotificationOptIn />}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not load dashboard: {error.message}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard
          label="Awaiting assignment"
          value={unassigned.length}
          tone={unassigned.length > 0 ? "accent" : "default"}
          icon={ClipboardList}
          href="/ptl/cases?status=pending_assignment"
        />
        <StatCard
          label="Broker Queue (Ready)"
          value={brokerQueuePendingCount ?? 0}
          tone={(brokerQueuePendingCount ?? 0) > 0 ? "accent" : "default"}
          icon={Send}
          href="/ptl/broker-queue?filter=pending"
        />
        <StatCard label="Branches covered" value={branches.length} icon={MapPin} />
        <StatCard label="Active POs tracked" value={workload.length} icon={Users} />
        <StatCard
          label="POs with no open cases"
          value={workload.filter((p) => p.open_case_count === 0).length}
          icon={UserCheck}
        />
      </div>

      <Card>
        <CardTitle>Awaiting Assignment</CardTitle>
        {unassigned.length === 0 ? (
          <EmptyState message="No cases are waiting to be assigned." />
        ) : (
          <div className="space-y-3">
            {unassigned.map((c) => (
              <Link
                key={c.id}
                href={`/ptl/cases/${c.id}`}
                className="block rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel-soft)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--brand)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-black text-zinc-950 dark:text-zinc-100">
                      {shortCaseRef(c.case_ref) ?? "(unsubmitted)"} — {vehicleLabel(c.make, c.model, c.variant)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {c.branch_name} · Sales Officer: {c.so_name ? `${c.so_name} (${c.so_employee_id})` : "—"}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    {formatINR(c.customer_expected_price)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>PO Workload</CardTitle>
        {workload.length === 0 ? (
          <EmptyState message="No active Purchase Officers in your branches yet." />
        ) : (
          <div className="space-y-5">
            {[...byBranch.entries()].map(([branchName, pos]) => (
              <div key={branchName}>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{branchName}</p>
                <div className="space-y-2">
                  {pos.map((po) => (
                    <div
                      key={po.po_id}
                      className="flex items-center justify-between rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm"
                    >
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {po.po_name} ({po.po_employee_id})
                      </span>
                      <span
                        className={`font-bold ${po.open_case_count === 0 ? "text-green-600 dark:text-green-400" : "text-[var(--muted)]"}`}
                      >
                        {po.open_case_count === 0 ? "Free" : `${po.open_case_count} open`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
