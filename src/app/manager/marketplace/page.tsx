import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { BrokerReport } from "@/lib/broker";
import { formatINR } from "@/lib/formatCurrency";
import { inputClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutoRefresh } from "@/components/broker/Refresh";
import { BrokerLoadError } from "@/components/broker/BrokerLoadError";
import { isValidDateInput } from "@/lib/validation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    branch?: string;
    broker?: string;
  }>;
}) {
  const params = await searchParams;
  const localToday = new Date();
  localToday.setMinutes(localToday.getMinutes() - localToday.getTimezoneOffset());
  const today = localToday.toISOString().slice(0, 10);
  const rawFrom = isValidDateInput(params.from) ? params.from! : "";
  const rawTo = isValidDateInput(params.to) ? params.to! : "";
  const dateError =
    (params.from && !rawFrom) || (params.to && !rawTo)
      ? "Use valid date filters."
      : rawFrom > today || rawTo > today
        ? "Date filters cannot be in the future."
        : rawFrom && rawTo && rawFrom > rawTo
          ? "From date must be on or before To date."
          : null;
  const from = dateError ? "" : rawFrom;
  const to = dateError ? "" : rawTo;
  const supabase = await createClient();
  const [{ data, error }, { data: branches }, unfiltered] = await Promise.all([
    supabase.rpc("broker_report", {
      p_from: from || undefined,
      p_to: to || undefined,
      p_branch: params.branch || undefined,
      p_broker: params.broker || undefined,
    }),
    supabase.from("branches").select("id,name").order("display_order"),
    supabase.rpc("broker_report", {}),
  ]);
  const report = data as unknown as BrokerReport | null;
  const choices = unfiltered.data as unknown as BrokerReport | null;
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PageHeader
        eyebrow="Marketplace analytics"
        title="Broker Performance"
        description="Measure listings, reservations, closed broker deals, expiries, and release reasons."
      />
      <form className="grid items-end gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)] @min-[32rem]:grid-cols-2 @min-[64rem]:grid-cols-5">
        <label className="text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            max={to || today}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={to}
            min={from || undefined}
            max={today}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          Branch
          <select
            name="branch"
            defaultValue={params.branch ?? ""}
            className={inputClass}
          >
            <option value="">All accessible branches</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Broker
          <select
            name="broker"
            defaultValue={params.broker ?? ""}
            className={inputClass}
          >
            <option value="">All brokers</option>
            {choices?.brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <Button>
          <Search size={16} />
          Apply
        </Button>
      </form>
      {dateError && (
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
          {dateError}
        </p>
      )}
      {error && <BrokerLoadError error={error} />}
      {report && (
        <>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
            {[
              ["Live listings", report.listed],
              ["Without current offers", report.without_offers],
              ["Active reservations", report.active],
              ["Expiring within 2 hours", report.expiring],
              ["Deals completed in period", report.completed],
              ["Broker deal value", formatINR(report.deal_value)],
              ["First listed in period", report.cohort_listed],
              [
                "Listing cohort conversion",
                report.cohort_listed
                  ? `${((100 * report.cohort_completed) / report.cohort_listed).toFixed(1)}%`
                  : "N/A",
              ],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_45px_rgb(33_25_20/0.06)] dark:shadow-none">
                <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</dt>
                <dd className="mt-2 text-2xl font-bold tabular-nums text-zinc-950 [overflow-wrap:anywhere] dark:text-zinc-50">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <Card className="space-y-3">
            <CardTitle>Reservation Attempts Started in Period</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="text-xs font-black uppercase text-[var(--muted)]">
                  <tr>
                    {[
                      "Broker",
                      "Attempts",
                      "Completed",
                      "Expired",
                      "Released",
                      "Completed value",
                    ].map((t) => (
                      <th key={t} className="border-b p-2 font-medium">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.brokers.map((b) => (
                    <tr key={b.id}>
                      {[
                        b.name,
                        b.attempts,
                        b.completed,
                        b.expired,
                        b.released,
                        formatINR(b.value),
                      ].map((v, i) => (
                        <td
                          key={i}
                          className="border-b border-zinc-100 p-2 dark:border-zinc-800"
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.brokers.length && (
              <p className="text-sm text-[var(--muted)]">No reservation attempts.</p>
            )}
          </Card>
          <Card className="space-y-2">
            <CardTitle>Expiry &amp; Release Reasons</CardTitle>
            {report.outcomes.map((r) => (
              <p key={r.reason} className="flex justify-between gap-3 text-sm">
                <span>{r.reason}</span>
                <strong>{r.count}</strong>
              </p>
            ))}
            {!report.outcomes.length && (
              <p className="text-sm text-[var(--muted)]">
                No expired or released attempts.
              </p>
            )}
          </Card>
          <Card className="space-y-3">
            <CardTitle>Recently Listed Cases (up to 100)</CardTitle>
            {report.cases.map((c) => (
              <Link
                key={c.id}
                href={`/manager/cases/${c.id}`}
                className="flex flex-wrap justify-between gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3 text-sm transition hover:border-[var(--brand)]"
              >
                <span className="font-black text-[var(--brand)]">
                  {c.case_ref} / {c.branch_name}
                </span>
                <span className="capitalize">
                  {c.broker_name && `${c.broker_name} / `}
                  {c.status.replaceAll("_", " ")}
                  {c.expires_at &&
                    ` / Due ${new Date(c.expires_at).toLocaleString("en-IN")}`}
                </span>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
