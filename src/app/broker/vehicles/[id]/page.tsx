import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MarketplaceResult } from "@/lib/broker";
import { formatINR } from "@/lib/formatCurrency";
import { PhotoGallery } from "@/components/PhotoGallery";
import { OfferForm } from "@/components/broker/OfferForm";
import { AutoRefresh, Deadline } from "@/components/broker/Refresh";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const current = await supabase.rpc("broker_marketplace", { p_case_id: id });
  if (current.error)
    return (
      <p role="alert" className="text-red-600">
        {current.error.message}
      </p>
    );
  let result = current.data as unknown as MarketplaceResult;
  if (!result.items.length) {
    const past = await supabase.rpc("broker_marketplace", {
      p_case_id: id,
      p_view: "offers",
    });
    if (past.error)
      return (
        <p role="alert" className="text-red-600">
          {past.error.message}
        </p>
      );
    result = past.data as unknown as MarketplaceResult;
  }
  const v = result.items[0];
  if (!v) notFound();
  return (
    <div className="space-y-5">
      <AutoRefresh />
      <Link
        href="/broker/dashboard"
        className="inline-flex items-center gap-1 text-sm text-blue-600"
      >
        <ArrowLeft size={16} />
        Marketplace
      </Link>
      <div>
        <p className="text-xs text-zinc-500">
          {v.case_ref} / {v.branch_name}
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          {v.make} {v.model} {v.variant}
        </h1>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-y border-zinc-200 py-4 text-sm sm:grid-cols-4 dark:border-zinc-800">
        {[
          ["Year", v.registration_year],
          ["Mileage", `${v.odometer_km.toLocaleString("en-IN")} km`],
          ["Fuel", v.fuel_type],
          ["Transmission", v.transmission],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-zinc-500">{label}</dt>
            <dd className="mt-1 capitalize">{value}</dd>
          </div>
        ))}
      </dl>
      <PhotoGallery photos={v.photos} />
      <p className="text-sm capitalize">
        {v.availability}
        {v.expires_at && (
          <>
            {" "}
            /{" "}
            <Deadline
              key={result.server_now}
              expiresAt={v.expires_at}
              serverNow={result.server_now}
            />
          </>
        )}
      </p>
      {v.own_offer && (
        <p className="text-sm">
          Your offer: <strong>{formatINR(v.own_offer.amount)}</strong> (
          {v.own_offer.status})
        </p>
      )}
      <OfferForm
        key={`${v.id}-${v.own_offer?.revision ?? 0}-${v.availability}`}
        vehicle={v}
      />
      {!!v.reservations.length && (
        <section className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="font-semibold">Your Reservations</h2>
          {v.reservations.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span className="capitalize">
                {r.status} / {formatINR(r.amount)} / Customer:{" "}
                {r.customer_decision ?? "awaiting decision"}
              </span>
              <span className="text-zinc-500">
                {new Date(r.started_at).toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </section>
      )}
      {!!v.history.length && (
        <section className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="font-semibold">Your Activity</h2>
          {v.history.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span className="capitalize">
                {e.event_type.replaceAll("_", " ")}
                {e.amount != null && ` / ${formatINR(e.amount)}`}
              </span>
              <time className="text-zinc-500">
                {new Date(e.created_at).toLocaleString("en-IN")}
              </time>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
