import Link from "next/link";
import { Search, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutoFilterSelect } from "@/components/ui/AutoFilterSelect";
import type { Enums } from "@/lib/supabase/database.types";

const inputClass =
  "rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-zinc-950 outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-red-500/10 dark:bg-white/5 dark:text-zinc-100";

const ROLE_LABELS: Record<string, string> = {
  sales_officer: "Sales Officer",
  purchase_officer: "Purchase Officer",
  sales_manager: "Sales Manager",
  cluster_manager: "Cluster Manager",
  po_manager: "PO Manager",
  admin: "Admin",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const { q, role, status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, employee_id, full_name, role, is_active, branches(name), clusters(name)")
    .order("full_name");

  if (role) query = query.eq("role", role as Enums<"app_role">);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);
  if (q) query = query.or(`full_name.ilike.%${q}%,employee_id.ilike.%${q}%`);

  const { data: users } = await query;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System administration"
        title="Users"
        description="Every staff account: Sales/Purchase Officers and the Manager family. Brokers are managed separately."
        actions={
          <Link href="/admin/users/new">
            <Button type="button">
              <Plus className="h-4 w-4" /> Create Account
            </Button>
          </Link>
        }
      />

      <form className="flex flex-wrap gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search name or Employee ID"
            className={`w-full pl-10 ${inputClass}`}
          />
        </div>
        <AutoFilterSelect name="role" defaultValue={role ?? ""} className={inputClass}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </AutoFilterSelect>
        <AutoFilterSelect name="status" defaultValue={status ?? ""} className={inputClass}>
          <option value="">Active + inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </AutoFilterSelect>
        <Button type="submit">Filter</Button>
        {(q || role || status) && (
          <Link href="/admin/users" className="self-center text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            Clear
          </Link>
        )}
      </form>

      {!users || users.length === 0 ? (
        <EmptyState message="No accounts match." />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {users.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="block rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_45px_rgb(33_25_20/0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)]"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-black text-zinc-950 dark:text-zinc-100">{u.full_name}</p>
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
                      u.is_active
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Employee ID</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{u.employee_id}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Role</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">
                      {ROLE_LABELS[u.role]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Scope</dt>
                    <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">
                      {u.branches?.name ?? u.clusters?.name ?? "All branches"}
                    </dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] shadow-[0_20px_60px_rgb(33_25_20/0.07)] md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--panel-soft)] text-left text-xs font-black uppercase text-[var(--muted)]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Employee ID</th>
                  <th className="whitespace-nowrap px-4 py-3">Name</th>
                  <th className="whitespace-nowrap px-4 py-3">Role</th>
                  <th className="whitespace-nowrap px-4 py-3">Scope</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--panel-soft)]">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="font-black text-[var(--brand)] hover:underline">
                        {u.employee_id}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{u.full_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {ROLE_LABELS[u.role]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {u.branches?.name ?? u.clusters?.name ?? "All branches"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
                          u.is_active
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
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
