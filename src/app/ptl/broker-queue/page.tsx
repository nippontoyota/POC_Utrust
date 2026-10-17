import Link from "next/link";
import { Send, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatINR } from "@/lib/formatCurrency";
import { vehicleLabel, shortCaseRef } from "@/lib/caseRef";
import { maskVehicleRegNumber } from "@/lib/panelBrokers";
import type { Enums } from "@/lib/supabase/database.types";

export default async function PtlBrokerQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile) {
    return <EmptyState message="Please sign in to view the Broker Queue." />;
  }

  const service = createServiceClient();
  const supabase = await createClient();

  // Get branches covered by this PTL
  const { data: ptlBranches } = await supabase
    .from("ptl_branches")
    .select("branch_id")
    .eq("ptl_id", profile.id);

  const branchIds = (ptlBranches ?? []).map((b) => b.branch_id);

  // Query broker cases
  let query = service
    .from("cases")
    .select(
      `id, case_ref, make, model, variant, color, registration_year, odometer_km,
       vehicle_reg_number, customer_name, customer_expected_price, status,
       broker_consent, broker_broadcast_at, created_at,
       branches(name, code),
       assigned_po:assigned_po_id(full_name, employee_id)`
    )
    .or("status.in.(listed_for_brokers,broker_offer_selected,broker_deal_closed),broker_consent.eq.true")
    .order("broker_broadcast_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (profile.role === "ptl" && branchIds.length > 0) {
    query = query.in("branch_id", branchIds);
  }

  if (filter === "pending") {
    query = query.is("broker_broadcast_at", null);
  } else if (filter === "broadcasted") {
    query = query.not("broker_broadcast_at", "is", null);
  }

  const { data: cases, error } = await query;
  const items = cases ?? [];

  const pendingCount = items.filter((c) => !c.broker_broadcast_at).length;
  const broadcastedCount = items.filter((c) => Boolean(c.broker_broadcast_at)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Broadcast Desk"
        title="Panel Broker Queue"
        description="Exchange and trade-in cars consented for broker listing across your branches. Review plate-hidden photos and broadcast via DoubleTick WhatsApp."
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Could not load broker queue: {error.message}
        </p>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-3 text-sm font-semibold">
        <Link
          href="/ptl/broker-queue?filter=all"
          className={`rounded-lg px-3 py-1.5 transition ${
            filter === "all"
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          }`}
        >
          All Cases ({items.length})
        </Link>
        <Link
          href="/ptl/broker-queue?filter=pending"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
            filter === "pending"
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          }`}
        >
          <Clock className="size-3.5" />
          Ready to Broadcast ({pendingCount})
        </Link>
        <Link
          href="/ptl/broker-queue?filter=broadcasted"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
            filter === "broadcasted"
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          }`}
        >
          <CheckCircle2 className="size-3.5" />
          Broadcasted ({broadcastedCount})
        </Link>
      </div>

      {!items.length ? (
        <Card>
          <EmptyState message="No cases are currently in the Broker Queue." />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const vehicle = `${c.registration_year ?? ""} ${vehicleLabel(c.make, c.model, c.variant)}`.trim();
            const branch = c.branches ? `${c.branches.name} (${c.branches.code})` : "—";
            const po = c.assigned_po ? `${c.assigned_po.full_name} (${c.assigned_po.employee_id})` : "Unassigned";
            const maskedPlate = maskVehicleRegNumber(c.vehicle_reg_number);
            const isBroadcasted = Boolean(c.broker_broadcast_at);

            return (
              <div
                key={c.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm transition hover:border-[var(--brand)] md:flex-row md:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-500">
                      {shortCaseRef(c.case_ref) ?? "(unsubmitted)"}
                    </span>
                    <Link
                      href={`/ptl/cases/${c.id}`}
                      className="text-base font-bold text-zinc-950 hover:underline dark:text-zinc-100"
                    >
                      {vehicle || "Untitled Vehicle"}
                    </Link>
                    <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {maskedPlate}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                    <span>
                      Branch: <strong className="text-zinc-700 dark:text-zinc-300">{branch}</strong>
                    </span>
                    <span>
                      PO: <strong className="text-zinc-700 dark:text-zinc-300">{po}</strong>
                    </span>
                    <span>
                      Expected: <strong className="text-zinc-700 dark:text-zinc-300">{formatINR(c.customer_expected_price)}</strong>
                    </span>
                    {c.color && (
                      <span>
                        Colour: <strong className="text-zinc-700 dark:text-zinc-300">{c.color}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 md:justify-end">
                  {isBroadcasted ? (
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 className="size-3.5" /> Broadcasted
                      </span>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        {new Date(c.broker_broadcast_at!).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      <Clock className="size-3.5" /> Ready to Broadcast
                    </span>
                  )}

                  <Link
                    href={`/ptl/cases/${c.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--foreground)] px-3.5 py-2 text-xs font-semibold text-[var(--background)] transition hover:opacity-90"
                  >
                    <Send className="size-3.5" />
                    {isBroadcasted ? "View Bids Leaderboard" : "Review & Broadcast"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
