import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PhotoGallery } from "@/components/PhotoGallery";
import { inputClass } from "@/components/ui/FormField";
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <span className="text-sm text-zinc-500">
          {result?.total ?? 0} vehicles
        </span>
      </div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          name="q"
          aria-label="Search make, model or reference"
          placeholder="Make, model or reference"
          defaultValue={params.q}
          className={inputClass}
          maxLength={100}
        />
        <select
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
        </select>
        <select
          name="sort"
          aria-label="Sort vehicles"
          defaultValue={params.sort ?? "newest"}
          className={inputClass}
        >
          <option value="newest">Newest listings</option>
          <option value="year">Newest vehicle year</option>
          <option value="mileage">Lowest mileage</option>
        </select>
        <button
          aria-label="Search vehicles"
          title="Search vehicles"
          className="flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white"
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
            className="min-w-0 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
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
              className="block text-lg font-semibold text-blue-600 dark:text-blue-400"
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
        className="flex items-center justify-between border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800"
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
