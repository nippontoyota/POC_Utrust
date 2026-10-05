import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CASE_STATUS_LABELS } from "@/lib/caseStatus";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CaseListCard } from "@/components/CaseListCard";
import { formatINR } from "@/lib/formatCurrency";
import type { Enums } from "@/lib/supabase/database.types";
import type { PoManagerCaseList } from "@/lib/poManager";

const inputClass =
  "rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-zinc-950 outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-red-500/10 dark:bg-white/5 dark:text-zinc-100";

export default async function ManagerCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; branch?: string; page?: string }>;
}) {
  const { q, status, branch, page: pageParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, cluster_id").eq("id", user!.id).single();
  const role = profile?.role ?? "manager";

  if (role === "po_manager") {
    const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
    const { data, error } = await supabase.rpc("po_manager_cases", {
      p_search: q ?? "",
      p_branch: branch || undefined,
      p_status: status || undefined,
      p_page: page,
    });
    const result = data as unknown as PoManagerCaseList | null;
    const pageUrl = (next: number) =>
      `?${new URLSearchParams({ q: q ?? "", status: status ?? "", page: String(next) })}`;

    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Case control"
          title="All Cases"
          description="Every case with an assigned Purchase Officer, across all branches. Customer details are never shown here."
        />

        <form className="flex flex-wrap gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search case ref, make, model, or reg number"
              className={`w-full pl-10 ${inputClass}`}
            />
          </div>
          <select name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">All statuses</option>
            {Object.entries(CASE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button type="submit">Filter</Button>
          {(q || status) && (
            <Link href="/manager/cases" className="self-center text-sm text-zinc-500 hover:underline dark:text-zinc-400">
              Clear
            </Link>
          )}
        </form>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Could not load cases: {error.message}
          </p>
        )}

        {!result?.items.length ? (
          <EmptyState message="No cases match." />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {result.items.map((c) => (
                <CaseListCard
                  key={c.id}
                  href={`/manager/cases/${c.id}`}
                  caseRef={c.case_ref ?? "(draft)"}
                  status={c.status as Enums<"case_status">}
                  rows={[
                    { label: "Branch", value: c.branch_name },
                    { label: "PO", value: `${c.po_name} (${c.po_employee_id})` },
                    { label: "Vehicle", value: [c.make, c.model, c.variant].filter(Boolean).join(" ") || "—" },
                    { label: "Offer Price", value: c.offer_price != null ? formatINR(c.offer_price) : "—" },
                  ]}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] shadow-[0_20px_60px_rgb(33_25_20/0.07)] md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-left text-xs font-black uppercase text-[var(--muted)]">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">Case Ref</th>
                    <th className="whitespace-nowrap px-4 py-3">Branch</th>
                    <th className="whitespace-nowrap px-4 py-3">Purchase Officer</th>
                    <th className="whitespace-nowrap px-4 py-3">Vehicle</th>
                    <th className="whitespace-nowrap px-4 py-3">Offer Price</th>
                    <th className="whitespace-nowrap px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {result.items.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--panel-soft)]">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/manager/cases/${c.id}`} className="font-black text-[var(--brand)] hover:underline">
                          {c.case_ref ?? "(draft)"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.branch_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {c.po_name} ({c.po_employee_id})
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {[c.make, c.model, c.variant].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {c.offer_price != null ? formatINR(c.offer_price) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={c.status as Enums<"case_status">} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav
              aria-label="Pagination"
              className="flex items-center justify-between border-t border-[var(--line)] pt-4 text-sm font-bold text-[var(--muted)]"
            >
              {page > 0 ? <Link href={pageUrl(page - 1)}>Previous</Link> : <span />}
              <span>
                Page {page + 1} of {Math.max(1, Math.ceil((result?.total ?? 0) / 20))}
              </span>
              {(page + 1) * 20 < (result?.total ?? 0) ? <Link href={pageUrl(page + 1)}>Next</Link> : <span />}
            </nav>
          </>
        )}
      </div>
    );
  }

  let query = supabase
    .from("cases")
    .select("id, case_ref, customer_name, customer_mobile, vehicle_reg_number, status, customer_expected_price, branches(name)")
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status as Enums<"case_status">);
  }
  if (q) {
    query = query.or(`case_ref.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle_reg_number.ilike.%${q}%`);
  }
  if (role === "cluster_manager" && branch) {
    query = query.eq("branch_id", branch);
  }

  const [{ data: cases }, { data: clusterBranches }] = await Promise.all([
    query,
    role === "cluster_manager" && profile?.cluster_id
      ? supabase.from("branches").select("id, name").eq("cluster_id", profile.cluster_id).order("display_order")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Case control"
        title="All Cases"
        description="Search by case, customer, or registration number and inspect branch-level movement."
      />

      <form className="flex flex-wrap gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search case ref, customer, or reg number"
            className={`w-full pl-10 ${inputClass}`}
          />
        </div>
        {role === "cluster_manager" && (
          <select name="branch" defaultValue={branch ?? ""} className={inputClass}>
            <option value="">All branches in cluster</option>
            {clusterBranches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select name="status" defaultValue={status ?? ""} className={inputClass}>
          <option value="">All statuses</option>
          {Object.entries(CASE_STATUS_LABELS).filter(([value]) => value !== "draft").map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit">Filter</Button>
        {(q || status || branch) && (
          <Link href="/manager/cases" className="self-center text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            Clear
          </Link>
        )}
      </form>

      {!cases || cases.length === 0 ? (
        <EmptyState message="No cases match." />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {cases.map((c) => (
              <CaseListCard
                key={c.id}
                href={`/manager/cases/${c.id}`}
                caseRef={c.case_ref ?? "(draft)"}
                status={c.status}
                rows={[
                  { label: "Branch", value: c.branches?.name ?? "—" },
                  { label: "Customer", value: c.customer_name ?? "—" },
                  { label: "Mobile", value: c.customer_mobile ?? "—" },
                  { label: "Vehicle", value: c.vehicle_reg_number ?? "—" },
                  { label: "Expected Price", value: formatINR(c.customer_expected_price) },
                ]}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] shadow-[0_20px_60px_rgb(33_25_20/0.07)] md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-left text-xs font-black uppercase text-[var(--muted)]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Case Ref</th>
                  <th className="whitespace-nowrap px-4 py-3">Branch</th>
                  <th className="whitespace-nowrap px-4 py-3">Customer</th>
                  <th className="whitespace-nowrap px-4 py-3">Mobile</th>
                  <th className="whitespace-nowrap px-4 py-3">Vehicle</th>
                  <th className="whitespace-nowrap px-4 py-3">Expected Price</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--panel-soft)]">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/manager/cases/${c.id}`} className="font-black text-[var(--brand)] hover:underline">
                        {c.case_ref ?? "(draft)"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.branches?.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.customer_mobile}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{c.vehicle_reg_number}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{formatINR(c.customer_expected_price)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
