import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MarketplaceResult } from "@/lib/broker";
import { formatINR } from "@/lib/formatCurrency";
import { PhotoGallery } from "@/components/PhotoGallery";
import { OfferForm } from "@/components/broker/OfferForm";
import { AutoRefresh, Deadline } from "@/components/broker/Refresh";
import { Card, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

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
        className="inline-flex items-center gap-1 text-sm font-black text-[var(--brand)]"
      >
        <ArrowLeft size={16} />
        Marketplace
      </Link>
      <PageHeader
        eyebrow={`${v.case_ref} / ${v.branch_name}`}
        title={`${v.make} ${v.model} ${v.variant}`}
        description="Broker-safe listing details and your private offer activity."
      />
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        {[
          ["Year", v.registration_year],
          ["Mileage", `${v.odometer_km.toLocaleString("en-IN")} km`],
          ["Fuel", v.fuel_type],
          ["Transmission", v.transmission],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_45px_rgb(33_25_20/0.06)]">
            <dt className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</dt>
            <dd className="mt-2 font-black capitalize text-zinc-950 dark:text-zinc-100">{value}</dd>
          </div>
        ))}
      </dl>
      <Card>
        <CardTitle>Vehicle Photos</CardTitle>
        <PhotoGallery photos={v.photos} />
      </Card>
      {v.reference_price != null && (
        <p className="text-sm">
          Reference price: <strong>{formatINR(v.reference_price)}</strong>
        </p>
      )}
      <p className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-black capitalize text-[var(--muted)]">
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
        <Card className="space-y-3">
          <CardTitle>Your Reservations</CardTitle>
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
        </Card>
      )}
      {!!v.history.length && (
        <Card className="space-y-3">
          <CardTitle>Your Activity</CardTitle>
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
        </Card>
      )}
    </div>
  );
}
