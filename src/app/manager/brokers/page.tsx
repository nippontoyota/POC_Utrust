import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrokerAdmin } from "@/components/broker/BrokerAdmin";
import { AutoRefresh } from "@/components/broker/Refresh";
import { inputClass } from "@/components/ui/FormField";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,is_group_manager,is_active")
    .eq("id", user!.id)
    .single();
  if (
    profile?.role !== "manager" ||
    !profile.is_group_manager ||
    !profile.is_active
  )
    notFound();
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const status = ["pending", "approved", "rejected", "suspended"].includes(
    params.status ?? "",
  )
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
      : query
          .eq("status", status as "pending" | "approved" | "rejected")
          .is("suspended_at", null);
  const { data, error, count } = await query;
  return (
    <div className="space-y-4">
      <AutoRefresh />
      <h1 className="text-xl font-semibold">
        Broker Applications &amp; Access
      </h1>
      <form className="flex gap-2">
        <select
          name="status"
          aria-label="Broker status"
          defaultValue={status}
          className={inputClass}
        >
          {["pending", "approved", "rejected", "suspended"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded-md border px-4 text-sm">Filter</button>
      </form>
      {error && (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      )}
      {!error && !data?.length && (
        <p className="text-sm text-zinc-500">No brokers in this view.</p>
      )}
      {data?.map((b) => (
        <BrokerAdmin key={b.id} broker={b} />
      ))}
      <div className="flex justify-between text-sm">
        {page > 0 ? (
          <Link href={`?status=${status}&page=${page - 1}`}>Previous</Link>
        ) : (
          <span />
        )}
        {(page + 1) * 20 < (count ?? 0) && (
          <Link href={`?status=${status}&page=${page + 1}`}>Next</Link>
        )}
      </div>
    </div>
  );
}
