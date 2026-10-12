"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Handshake,
  Wallet,
  Store,
  FileStack,
  AlertTriangle,
  ChevronDown,
  Clock,
  TriangleAlert,
  ClipboardList,
  Building2,
  Package,
  Download,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatINR, formatINRCompact } from "@/lib/formatCurrency";
import { vehicleLabel, shortCaseRef } from "@/lib/caseRef";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { ExceptionsDrawer, type ExceptionsKind } from "./ExceptionsDrawer";
import { ExportDialog } from "./ExportDialog";
import type { CeoOverview, CeoCohortCase } from "@/lib/ceo";
import type { Enums } from "@/lib/supabase/database.types";

const PIPELINE_STAGES: { key: keyof CeoOverview["pipeline"]; label: string; statuses: string[]; tone: "neutral" | "success" | "muted" }[] = [
  { key: "pending_evaluation", label: "Pending evaluation", statuses: ["pending_evaluation"], tone: "neutral" },
  { key: "awaiting_customer_decision", label: "Awaiting customer decision", statuses: ["pending_customer_decision"], tone: "neutral" },
  { key: "nippon_purchase_pending", label: "Nippon purchase pending", statuses: ["purchase_completion_pending"], tone: "neutral" },
  { key: "broker_listing_live", label: "Broker listing live", statuses: ["listed_for_brokers"], tone: "neutral" },
  { key: "broker_completion_pending", label: "Broker completion pending", statuses: ["broker_offer_selected"], tone: "neutral" },
  { key: "nippon_purchases_closed", label: "Nippon purchases closed", statuses: ["closed"], tone: "success" },
  { key: "broker_deals_closed", label: "Broker deals closed", statuses: ["broker_deal_closed"], tone: "success" },
  { key: "cancelled_no_consent_expired", label: "Cancelled / no consent / expired", statuses: ["cancelled", "withdrawn", "rejected_not_listed", "no_broker_interest", "no_customer_decision"], tone: "muted" },
];

function caseAmount(c: CeoCohortCase): number | null {
  return c.nippon_amount ?? c.broker_amount ?? null;
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCasesCsv(cases: CeoCohortCase[], suffix: string) {
  const header = ["Case Ref", "Branch", "Vehicle", "Reg Number", "Status", "Submitted At", "Nippon Amount", "Broker Amount"];
  const rows = cases.map((c) => [
    c.case_ref ?? "",
    c.branch_name,
    vehicleLabel(c.make, c.model, c.variant),
    c.vehicle_reg_number ?? "",
    CASE_STATUS_LABELS[c.status as Enums<"case_status">] ?? c.status,
    c.submitted_at ?? "",
    c.nippon_amount ?? "",
    c.broker_amount ?? "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ceo-overview-${suffix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CeoDashboard({ overview, branches }: { overview: CeoOverview; branches: { id: string; name: string }[] }) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<ExceptionsKind | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const { kpis, pipeline, branch_performance, attention, broker_marketplace, cases } = overview;

  const casesByStatus = useMemo(() => {
    const map = new Map<string, CeoCohortCase[]>();
    for (const c of cases) {
      const list = map.get(c.status) ?? [];
      list.push(c);
      map.set(c.status, list);
    }
    return map;
  }, [cases]);

  const casesByBranch = useMemo(() => {
    const map = new Map<string, CeoCohortCase[]>();
    for (const c of cases) {
      const list = map.get(c.branch_name) ?? [];
      list.push(c);
      map.set(c.branch_name, list);
    }
    return map;
  }, [cases]);

  function casesForStage(stage: (typeof PIPELINE_STAGES)[number]) {
    return stage.statuses.flatMap((s) => casesByStatus.get(s) ?? []);
  }

  function handleExportConfirm({ from, to, branchId }: { from: string; to: string; branchId: string }) {
    const branchName = branchId ? branches.find((b) => b.id === branchId)?.name : undefined;
    const filtered = cases.filter((c) => {
      if (branchName && c.branch_name !== branchName) return false;
      const submittedDate = c.submitted_at?.slice(0, 10);
      if (from && (!submittedDate || submittedDate < from)) return false;
      if (to && (!submittedDate || submittedDate > to)) return false;
      return true;
    });
    downloadCasesCsv(filtered, `${from || "all"}-to-${to || "all"}${branchName ? `-${branchName}` : ""}`);
    setExportOpen(false);
  }

  const maxStageCount = Math.max(1, ...PIPELINE_STAGES.map((s) => pipeline[s.key] as number));

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-zinc-950 dark:text-zinc-50 sm:text-3xl">CEO Overview</h1>
        <Button variant="secondary" onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4" /> Export report
        </Button>
      </div>

      {/* ── KPI row (static) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Handshake} label="Completed deals" value={kpis.completed_deals} footer={`${kpis.completed_nippon} Nippon • ${kpis.completed_broker} Broker`} />
        <StatCard icon={Wallet} label="Nippon purchase value" value={formatINRCompact(kpis.nippon_purchase_value)} footer={`${kpis.nippon_purchase_count} completed purchases`} />
        <StatCard icon={Store} label="Broker deal value" value={formatINRCompact(kpis.broker_deal_value)} footer={`${kpis.broker_deal_count} completed broker deals`} />
        <StatCard icon={FileStack} label="Open cases" value={kpis.open_cases} footer="Across both routes" />
        <StatCard icon={AlertTriangle} label="Decision window alerts" value={kpis.due_soon_count + kpis.expired_count} footer={`${kpis.due_soon_count} due soon • ${kpis.expired_count} expired`} tone="warning" />
      </div>

      {/* ── Case pipeline ── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="mb-0">Case pipeline</CardTitle>
          <span className="rounded-full bg-[var(--panel-soft)] px-3 py-1 text-xs font-bold text-[var(--muted)]">{pipeline.total} cases</span>
        </div>
        <p className="mb-4 -mt-2 text-xs text-[var(--muted)]">Click a stage to see its cases.</p>
        <div className="space-y-2">
          {PIPELINE_STAGES.map((stage) => {
            const count = pipeline[stage.key] as number;
            const open = expandedStage === stage.key;
            const stageCases = casesForStage(stage);
            return (
              <div key={stage.key}>
                <button
                  type="button"
                  onClick={() => setExpandedStage((v) => (v === stage.key ? null : stage.key))}
                  className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--panel-soft)]"
                  aria-expanded={open}
                >
                  <span title={stage.label} className="w-28 shrink-0 truncate text-sm text-zinc-700 dark:text-zinc-300 sm:w-56">{stage.label}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                    <span
                      className={`block h-full rounded-full transition-[width] duration-500 ${
                        stage.tone === "success" ? "bg-green-500" : stage.tone === "muted" ? "bg-zinc-400 dark:bg-zinc-600" : "bg-[var(--brand)]"
                      }`}
                      style={{ width: `${(count / maxStageCount) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{count}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="px-2 py-3 pl-4 sm:pl-[15.5rem]">
                      {stageCases.length === 0 ? (
                        <p className="text-sm text-[var(--muted)]">No cases in this stage.</p>
                      ) : (
                        <MiniCaseList cases={stageCases} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Attention required ── */}
        <Card>
          <CardTitle>Attention required</CardTitle>
          <p className="mb-4 -mt-3 text-xs text-[var(--muted)]">Cases that need follow-through, right now.</p>
          <div className="space-y-2">
            <AttentionRow
              icon={Clock}
              tone="warning"
              count={attention.due_soon.length}
              title="Customer decisions due within 12h"
              subtitle="PO follow-up"
              onClick={() => setDrawer("due_soon")}
            />
            <AttentionRow
              icon={TriangleAlert}
              tone="danger"
              count={attention.expired.length}
              title="Decision windows expired"
              subtitle="Pending PO closure"
              onClick={() => setDrawer("expired")}
            />
            <AttentionRow
              icon={ClipboardList}
              tone="neutral"
              count={attention.accepted_pending.length}
              title="Accepted, purchase not completed"
              subtitle="Completion follow-up"
              onClick={() => setDrawer("accepted_pending")}
            />
          </div>
        </Card>

        {/* ── Broker marketplace ── */}
        <Card>
          <CardTitle>Broker marketplace</CardTitle>
          <p className="mb-4 -mt-3 text-xs text-[var(--muted)]">Live snapshot.</p>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={Package} label="Live listings" value={broker_marketplace.live_listings} />
            <MiniStat icon={Clock} label="Awaiting completion" value={broker_marketplace.awaiting_completion} />
            <MiniStat icon={AlertTriangle} label="Listings without bids" value={broker_marketplace.without_bids} />
            <MiniStat icon={Handshake} label="Closed deals" value={broker_marketplace.closed_deals} />
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Closed broker deal value to date: <span className="font-bold text-zinc-900 dark:text-zinc-100">{formatINR(broker_marketplace.deal_value)}</span>.
            Broker Coordinator owns deal completion.
          </p>
        </Card>
      </div>

      {/* ── Branch performance ── */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[var(--muted)]" />
          <CardTitle className="mb-0">Branch performance</CardTitle>
        </div>
        {branch_performance.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No cases yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[var(--line)] text-left text-xs font-black uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Cases</th>
                  <th className="px-3 py-2 text-right">Nippon closed</th>
                  <th className="px-3 py-2 text-right">Broker closed</th>
                  <th className="px-3 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {branch_performance.map((b) => {
                  const open = expandedBranch === b.branch_name;
                  const branchCases = casesByBranch.get(b.branch_name) ?? [];
                  return (
                    <Fragment key={b.branch_name}>
                      <tr
                        onClick={() => setExpandedBranch((v) => (v === b.branch_name ? null : b.branch_name))}
                        className="cursor-pointer hover:bg-[var(--panel-soft)]"
                        aria-expanded={open}
                      >
                        <td className="px-3 py-2.5 font-bold text-zinc-900 dark:text-zinc-100">
                          <span className="inline-flex items-center gap-1.5">
                            {b.branch_name}
                            <ChevronDown className={`h-3.5 w-3.5 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} />
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{b.cases}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{b.nippon_closed}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{b.broker_closed}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{b.open_cases}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-0">
                          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                              <div className="bg-[var(--panel-soft)] px-4 py-3">
                                {branchCases.length === 0 ? (
                                  <p className="text-sm text-[var(--muted)]">No cases.</p>
                                ) : (
                                  <MiniCaseList cases={branchCases} />
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-[var(--line)] font-black text-zinc-950 dark:text-zinc-50">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{branch_performance.reduce((s, b) => s + b.cases, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{branch_performance.reduce((s, b) => s + b.nippon_closed, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{branch_performance.reduce((s, b) => s + b.broker_closed, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{branch_performance.reduce((s, b) => s + b.open_cases, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--muted)]">
        Values reflect completed deals. Nippon amounts use the final accepted price. Broker value is not Nippon revenue.
      </p>

      <ExceptionsDrawer kind={drawer} attention={attention} onClose={() => setDrawer(null)} />
      <ExportDialog open={exportOpen} branches={branches} onClose={() => setExportOpen(false)} onConfirm={handleExportConfirm} />
    </div>
  );
}

// ─── Attention required row ───────────────────────────────────────────────

function AttentionRow({
  icon: Icon,
  tone,
  count,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "warning" | "danger" | "neutral";
  count: number;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  const toneClass =
    tone === "warning"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      : tone === "danger"
        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
        : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-left transition hover:border-[var(--brand)] disabled:cursor-default disabled:opacity-50 disabled:hover:border-[var(--line)]"
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-black tabular-nums leading-tight text-zinc-950 dark:text-zinc-50">{count}</span>
        <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        <span className="block text-xs text-[var(--muted)]">{subtitle}</span>
      </span>
    </button>
  );
}

// ─── Small stat tile (broker marketplace) ─────────────────────────────────

function MiniStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
      <Icon className="h-4 w-4 text-[var(--muted)]" />
      <p className="mt-2 text-xl font-black tabular-nums text-zinc-950 dark:text-zinc-50">{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

// ─── Mini case list (shared by pipeline/branch expansions) ───────────────

export function MiniCaseList({ cases }: { cases: CeoCohortCase[] }) {
  const shown = cases.slice(0, 8);
  return (
    <div className="space-y-1.5">
      {shown.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {vehicleLabel(c.make, c.model, c.variant)}
            {c.vehicle_reg_number ? ` — ${c.vehicle_reg_number}` : ""}
          </span>
          <span className="text-xs text-[var(--muted)]">{c.branch_name}</span>
          {c.case_ref && <span className="text-xs text-[var(--muted)]">{shortCaseRef(c.case_ref)}</span>}
          <StatusBadge status={c.status as Enums<"case_status">} />
          {caseAmount(c) != null && <span className="ml-auto text-xs font-bold tabular-nums text-zinc-700 dark:text-zinc-300">{formatINR(caseAmount(c))}</span>}
        </div>
      ))}
      {cases.length > shown.length && <p className="text-xs text-[var(--muted)]">+{cases.length - shown.length} more</p>}
    </div>
  );
}
