"use client";

import { useState } from "react";
import { Check, LockKeyhole, X } from "lucide-react";
import type { StaffBrokerCase } from "@/lib/broker";
import { formatINR } from "@/lib/formatCurrency";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { ActionFeedback, useBrokerAction } from "./useBrokerAction";
import { AutoRefresh, Deadline } from "./Refresh";

export function StaffBrokerControls({
  caseId,
  status,
  data,
  readOnly,
}: {
  caseId: string;
  status: string;
  data: StaffBrokerCase;
  readOnly: boolean;
}) {
  const { busy, error, success, act, run } = useBrokerAction();
  const [reason, setReason] = useState("");
  const [payment, setPayment] = useState(false);
  const [handover, setHandover] = useState(false);
  const hold = data.reservations.find(
    (r) =>
      r.status === "active" &&
      Date.parse(r.expires_at) > Date.parse(data.server_now),
  );
  const stale = data.reservations.some(
    (r) =>
      r.status === "active" &&
      Date.parse(r.expires_at) <= Date.parse(data.server_now),
  );
  const open = ["listed_for_brokers", "broker_offer_selected"].includes(status);
  const canReview =
    !readOnly && (open || status === "pending_customer_decision");
  const actionPayload = { reservation_id: hold?.id ?? "", reason };
  return (
    <section className="mt-8 space-y-5 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <AutoRefresh />
      <h2 className="text-lg font-semibold">Broker Marketplace</h2>
      <ActionFeedback error={error} success={success} />
      {canReview && (
        <details
          className="border-b border-zinc-200 pb-4 dark:border-zinc-800"
          open={!data.photos.some((p) => p.broker_visible)}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Photo Review ({data.photos.filter((p) => p.broker_visible).length}{" "}
            approved)
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.photos.map((photo) => (
              <div key={photo.id} className="min-w-0 space-y-2">
                <PhotoGallery photos={[photo]} />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={busy || photo.is_plate_visible || photo.category === "rc_book"}
                    checked={!!photo.broker_visible}
                    onChange={(e) =>
                      run("review_broker_photo", {
                        p_photo_id: photo.id,
                        p_visible: e.target.checked,
                      })
                    }
                    className="mt-1"
                  />
                  <span>
                    {photo.category === "rc_book"
                      ? "Private: RC book document"
                      : photo.is_plate_visible
                      ? "Private: registration plate visible"
                      : "Reviewed: no plate, personal details or documents. Publish to brokers."}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </details>
      )}
      {open && !data.photos.some((p) => p.broker_visible) && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Hidden from the marketplace until at least one photo is approved.
        </p>
      )}
      {stale && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          The reservation expired. Previous offers need broker reconfirmation.
        </p>
      )}
      {!readOnly && open && (
        <FormField label="Selection / release / withdrawal reason">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            className={inputClass}
            rows={2}
          />
        </FormField>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>
              {["Broker", "Offer", "Submitted", "Status", ""].map((t, i) => (
                <th key={i} className="px-2 py-3 font-medium">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.offers.map((o) => (
              <tr
                key={o.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="max-w-64 px-2 py-3">
                  <p>{o.broker_name}</p>
                  <p className="text-xs text-zinc-500">
                    {o.broker_ref}
                    {!o.approved && " / unavailable"}
                  </p>
                  <p className="text-xs">
                    {o.broker_contact} /{" "}
                    <a className="text-blue-600" href={`tel:${o.broker_phone}`}>
                      {o.broker_phone}
                    </a>
                  </p>
                  {o.note && (
                    <p className="mt-1 break-words text-xs text-zinc-500">
                      {o.note}
                    </p>
                  )}
                </td>
                <td className="px-2 py-3 font-medium tabular-nums">
                  {formatINR(o.amount)}
                </td>
                <td className="px-2 py-3">
                  {new Date(o.submitted_at).toLocaleString("en-IN")}
                </td>
                <td className="px-2 py-3 capitalize">
                  {stale && ["current", "selected"].includes(o.status)
                    ? "reconfirm"
                    : o.status}
                </td>
                <td className="px-2 py-3">
                  {!readOnly &&
                    open &&
                    !hold &&
                    !stale &&
                    o.status === "current" &&
                    o.approved && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act(caseId, "select", {
                            offer_id: o.id,
                            revision: o.revision,
                            reason,
                          })
                        }
                      >
                        <LockKeyhole size={15} />
                        Select for 48h
                      </Button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.offers.length && (
        <p className="text-sm text-zinc-500">No broker offers yet.</p>
      )}
      {hold && (
        <div className="space-y-3 border-y border-zinc-200 py-4 dark:border-zinc-800">
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-semibold">Reserved: {hold.broker_name}</h3>
            <Deadline
              key={data.server_now}
              expiresAt={hold.expires_at}
              serverNow={data.server_now}
            />
          </div>
          <p className="text-sm">
            {formatINR(hold.amount)} / Customer:{" "}
            {hold.customer_decision ?? "awaiting decision"}
          </p>
          {!readOnly && (
            <>
              {!hold.customer_decision && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => act(caseId, "accept", actionPayload)}
                  >
                    <Check size={16} />
                    Customer accepted
                  </Button>
                  <Button
                    disabled={busy || !reason.trim()}
                    variant="destructive"
                    onClick={() => act(caseId, "reject", actionPayload)}
                  >
                    <X size={16} />
                    Customer rejected
                  </Button>
                </div>
              )}
              {hold.customer_decision === "accepted" && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={payment}
                      onChange={(e) => setPayment(e.target.checked)}
                    />
                    Payment completed
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={handover}
                      onChange={(e) => setHandover(e.target.checked)}
                    />
                    Vehicle handover completed
                  </label>
                  <Button
                    disabled={busy || !payment || !handover}
                    onClick={async () => {
                      if (
                        await act(caseId, "complete", {
                          ...actionPayload,
                          payment_complete: payment,
                          handover_complete: handover,
                        })
                      ) {
                        setPayment(false);
                        setHandover(false);
                      }
                    }}
                  >
                    <Check size={16} />
                    Complete broker deal
                  </Button>
                </div>
              )}
              <Button
                variant="secondary"
                disabled={busy || !reason.trim()}
                onClick={() => act(caseId, "release", actionPayload)}
              >
                <X size={16} />
                Release reservation
              </Button>
            </>
          )}
        </div>
      )}
      {!readOnly && open && (
        <Button
          variant="destructive"
          disabled={busy || !reason.trim()}
          onClick={() => act(caseId, "withdraw_consent", { reason })}
        >
          <X size={16} />
          Withdraw customer consent and delist
        </Button>
      )}
      {!!data.reservations.length && (
        <div className="space-y-3">
          <h3 className="font-semibold">Reservation History</h3>
          {data.reservations.map((r) => (
            <div
              key={r.id}
              className="border-b border-zinc-100 pb-3 text-sm dark:border-zinc-800"
            >
              <p>
                {r.broker_name} / {formatINR(r.amount)} /{" "}
                <span className="capitalize">
                  {r.status === "active" &&
                  Date.parse(r.expires_at) <= Date.parse(data.server_now)
                    ? "expired"
                    : r.status}
                </span>
              </p>
              <p className="text-xs text-zinc-500">
                {new Date(r.started_at).toLocaleString("en-IN")} to{" "}
                {new Date(r.expires_at).toLocaleString("en-IN")}
              </p>
              {r.selection_reason && <p>Selection: {r.selection_reason}</p>}
              {r.end_reason && <p>Outcome: {r.end_reason}</p>}
            </div>
          ))}
        </div>
      )}
      {!!data.events.length && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Broker Activity ({data.events.length})
          </summary>
          <ol className="mt-3 space-y-3">
            {data.events.map((e) => {
              const meta =
                e.metadata &&
                typeof e.metadata === "object" &&
                !Array.isArray(e.metadata)
                  ? e.metadata
                  : {};
              return (
                <li key={e.id} className="text-sm">
                  <p className="capitalize">
                    {e.event_type.replaceAll("_", " ")} /{" "}
                    {new Date(e.created_at).toLocaleString("en-IN")}
                  </p>
                  {typeof meta.amount === "number" && (
                    <p>
                      {formatINR(meta.amount)}
                      {typeof meta.revision === "number" &&
                        ` / Revision ${meta.revision}`}
                    </p>
                  )}
                  {typeof meta.note === "string" && (
                    <p className="break-words text-zinc-500">{meta.note}</p>
                  )}
                  {e.notes && <p className="text-zinc-500">{e.notes}</p>}
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
