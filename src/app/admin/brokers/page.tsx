import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { BrokerAdmin } from "@/components/broker/BrokerAdmin";
import { BrokerLoadError } from "@/components/broker/BrokerLoadError";
import { AutoRefresh } from "@/components/broker/Refresh";
import { inputClass } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutoFilterSelect } from "@/components/ui/AutoFilterSelect";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin" || !profile.is_active) notFound();
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const status = ["pending", "approved", "rejected", "suspended"].includes(params.status ?? "")
    ? params.status!
    : "pending";
  let query = supabase
    .from("brokers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * 20, page * 20 + 19);
  query =
    status === "suspended"
      ? query.not("suspended_at", "is", null)
      : query.eq("status", status as "pending" | "approved" | "rejected").is("suspended_at", null);
  const { data, error, count } = await query;
  return (
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        eyebrow="System administration"
        title="Broker Applications & Access"
        description="Approve brokers, suspend marketplace access, and keep broker status auditable."
      />
      <form className="flex gap-2 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
        <AutoFilterSelect name="status" aria-label="Broker status" defaultValue={status} className={inputClass}>
          {["pending", "approved", "rejected", "suspended"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </AutoFilterSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {error && <BrokerLoadError error={error} area="access" />}
      {!error && !data?.length && <EmptyState message="No brokers in this view." />}
      {!error && data?.map((b) => <BrokerAdmin key={b.id} broker={b} />)}
      {!error && (
        <div className="flex justify-between text-sm">
          {page > 0 ? <Link href={`?status=${status}&page=${page - 1}`}>Previous</Link> : <span />}
          {(page + 1) * 20 < (count ?? 0) && <Link href={`?status=${status}&page=${page + 1}`}>Next</Link>}
        </div>
      )}
    </div>
  );
}
