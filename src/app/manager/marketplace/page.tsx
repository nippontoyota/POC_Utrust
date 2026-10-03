import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { BrokerReport } from "@/lib/broker";
import { formatINR } from "@/lib/formatCurrency";
import { inputClass } from "@/components/ui/FormField";
import { AutoRefresh } from "@/components/broker/Refresh";

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
  const supabase = await createClient();
  const [{ data, error }, { data: branches }, unfiltered] = await Promise.all([
    supabase.rpc("broker_report", {
      p_from: params.from || undefined,
      p_to: params.to || undefined,
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
      <h1 className="text-xl font-semibold">Broker Performance</h1>
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={params.from}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={params.to}
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
        <button className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white">
          <Search size={16} />
          Apply
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      )}
      {report && (
        <>
          <dl className="grid grid-cols-2 gap-5 border-y border-zinc-200 py-5 md:grid-cols-4 dark:border-zinc-800">
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
              <div key={label}>
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd className="mt-1 break-words text-xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <section className="space-y-3">
            <h2 className="font-semibold">
              Reservation Attempts Started in Period
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
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
              <p className="text-sm text-zinc-500">No reservation attempts.</p>
            )}
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Expiry &amp; Release Reasons</h2>
            {report.outcomes.map((r) => (
              <p key={r.reason} className="flex justify-between gap-3 text-sm">
                <span>{r.reason}</span>
                <strong>{r.count}</strong>
              </p>
            ))}
            {!report.outcomes.length && (
              <p className="text-sm text-zinc-500">
                No expired or released attempts.
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Recently Listed Cases (up to 100)</h2>
            {report.cases.map((c) => (
              <Link
                key={c.id}
                href={`/manager/cases/${c.id}`}
                className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 pb-3 text-sm dark:border-zinc-800"
              >
                <span className="text-blue-600">
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
          </section>
        </>
      )}
    </div>
  );
}
