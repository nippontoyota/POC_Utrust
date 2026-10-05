import { UsersRound, UserCheck, UserX, Clock, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";

type Summary = {
  staff_by_role: Record<string, number>;
  staff_active: number;
  staff_inactive: number;
  brokers_pending: number;
  brokers_approved: number;
  brokers_suspended: number;
  brokers_rejected: number;
};

const ROLE_LABELS: Record<string, string> = {
  sales_officer: "Sales Officers",
  purchase_officer: "Purchase Officers",
  manager: "Managers",
  sales_manager: "Sales Managers",
  cluster_manager: "Cluster Managers",
  po_manager: "PO Managers",
  admin: "Admins",
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard_summary", {});
  const summary = data as unknown as Summary | null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System administration"
        title="Dashboard"
        description="Account and broker counts across the whole system. No case or customer data lives here."
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not load summary: {error.message}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard
          label="Total staff accounts"
          value={(summary?.staff_active ?? 0) + (summary?.staff_inactive ?? 0)}
          icon={UsersRound}
          href="/admin/users"
        />
        <StatCard label="Active" value={summary?.staff_active ?? 0} icon={UserCheck} href="/admin/users" />
        <StatCard
          label="Inactive"
          value={summary?.staff_inactive ?? 0}
          tone={summary && summary.staff_inactive > 0 ? "warning" : "default"}
          icon={UserX}
          href="/admin/users"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard
          label="Pending broker applications"
          value={summary?.brokers_pending ?? 0}
          tone={summary && summary.brokers_pending > 0 ? "accent" : "default"}
          icon={Clock}
          href="/admin/brokers"
        />
        <StatCard label="Approved brokers" value={summary?.brokers_approved ?? 0} icon={ShieldCheck} href="/admin/brokers" />
        <StatCard label="Suspended brokers" value={summary?.brokers_suspended ?? 0} icon={ShieldAlert} href="/admin/brokers" />
        <StatCard label="Rejected applications" value={summary?.brokers_rejected ?? 0} icon={ShieldX} href="/admin/brokers" />
      </div>

      {summary && (
        <div className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
          <h2 className="mb-4 text-sm font-black uppercase tracking-[0.12em] text-[var(--muted)]">Staff by role</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <div
                key={role}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3"
              >
                <span className="text-sm font-medium text-[var(--muted)]">{label}</span>
                <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {summary.staff_by_role[role] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
