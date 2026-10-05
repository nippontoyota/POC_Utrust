import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PhotoGallery } from "@/components/PhotoGallery";
import { inputClass } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutoFilterSelect } from "@/components/ui/AutoFilterSelect";
import { formatINR } from "@/lib/formatCurrency";
import type { MarketplaceResult } from "@/lib/broker";
import { AutoRefresh, Deadline } from "./Refresh";

export type MarketParams = {
  q?: string;
  branch?: string;
  page?: string;
  sort?: string;
};
export async function Marketplace({
  view,
  params,
}: {
  view: "marketplace" | "offers" | "reservations" | "history";
  params: MarketParams;
}) {
  const supabase = await createClient();
  const page = Math.max(
    0,
    Math.min(10000, Number.parseInt(params.page ?? "0", 10) || 0),
  );
  const [{ data, error }, { data: branches }] = await Promise.all([
    supabase.rpc("broker_marketplace", {
      p_view: view,
      p_search: params.q ?? "",
      p_branch: params.branch || undefined,
      p_page: page,
      p_sort: params.sort ?? "newest",
    }),
    supabase.from("branches").select("id,name").order("display_order"),
  ]);
  const result = data as unknown as MarketplaceResult | null;
  const pageUrl = (next: number) =>
    `?${new URLSearchParams({ q: params.q ?? "", branch: params.branch ?? "", sort: params.sort ?? "newest", page: String(next) })}`;
  const title = {
    marketplace: "Marketplace",
    offers: "My Offers",
    reservations: "Active Reservations",
    history: "Deal History",
  }[view];
  return (
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        eyebrow="Broker desk"
        title={title}
        description="Browse broker-safe vehicle listings, manage private offers, and track active holds."
        actions={<span className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-black text-[var(--muted)] shadow-sm">
          {result?.total ?? 0} vehicles
        </span>}
      />
      <form className="grid gap-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_55px_rgb(33_25_20/0.06)] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          name="q"
          aria-label="Search make, model or reference"
          placeholder="Make, model or reference"
          defaultValue={params.q}
          className={inputClass}
          maxLength={100}
        />
        <AutoFilterSelect
          name="branch"
          aria-label="Branch"
          defaultValue={params.branch ?? ""}
          className={inputClass}
        >
          <option value="">All branches</option>
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </AutoFilterSelect>
        <AutoFilterSelect
          name="sort"
          aria-label="Sort vehicles"
          defaultValue={params.sort ?? "newest"}
          className={inputClass}
        >
          <option value="newest">Newest listings</option>
          <option value="year">Newest vehicle year</option>
          <option value="mileage">Lowest mileage</option>
        </AutoFilterSelect>
        <button
          aria-label="Search vehicles"
          title="Search vehicles"
          className="flex min-h-12 items-center justify-center rounded-full bg-[var(--brand)] px-5 py-2 text-white shadow-[0_14px_30px_rgb(226_61_47/0.22)] transition hover:bg-[var(--brand-strong)]"
        >
          <Search size={18} />
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Could not load vehicles: {error.message}
        </p>
      )}
      {!error && !result?.items.length && (
        <p className="py-8 text-sm text-zinc-500">
          No vehicles match this view.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {result?.items.map((v) => (
          <article
            key={v.id}
            className="min-w-0 space-y-3 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_20px_60px_rgb(33_25_20/0.07)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-500">{v.case_ref}</span>
              <span
                className={`text-xs font-medium capitalize ${v.availability === "open" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
              >
                {v.availability}
              </span>
            </div>
            <Link
              href={`/broker/vehicles/${v.id}`}
              className="block text-lg font-black text-zinc-950 hover:text-[var(--brand)] dark:text-zinc-100"
            >
              {v.make} {v.model} {v.variant}
            </Link>
            <p className="text-sm text-zinc-500">
              {v.branch_name} / {v.registration_year} /{" "}
              {v.odometer_km.toLocaleString("en-IN")} km
            </p>
            <PhotoGallery photos={v.photos.slice(0, 2)} />
            {v.own_offer && (
              <p className="text-sm">
                Your offer: <strong>{formatINR(v.own_offer.amount)}</strong>{" "}
                <span className="text-zinc-500">({v.own_offer.status})</span>
              </p>
            )}
            {v.expires_at && (
              <p className="text-sm">
                <Deadline
                  key={result.server_now}
                  expiresAt={v.expires_at}
                  serverNow={result.server_now}
                />
              </p>
            )}
            {view === "history" && v.reservations[0] && (
              <p className="text-sm capitalize">
                Latest attempt: {v.reservations[0].status}
              </p>
            )}
          </article>
        ))}
      </div>
      <nav
        aria-label="Pagination"
        className="flex items-center justify-between border-t border-[var(--line)] pt-4 text-sm font-bold text-[var(--muted)]"
      >
        {page > 0 ? (
          <Link
            href={pageUrl(page - 1)}
            aria-label="Previous page"
            title="Previous page"
          >
            <ChevronLeft />
          </Link>
        ) : (
          <span />
        )}
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil((result?.total ?? 0) / 12))}
        </span>
        {(page + 1) * 12 < (result?.total ?? 0) ? (
          <Link
            href={pageUrl(page + 1)}
            aria-label="Next page"
            title="Next page"
          >
            <ChevronRight />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
