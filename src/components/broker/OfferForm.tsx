"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import type { MarketplaceVehicle } from "@/lib/broker";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { ActionFeedback, useBrokerAction } from "./useBrokerAction";

export function OfferForm({ vehicle }: { vehicle: MarketplaceVehicle }) {
  const { busy, error, success, act } = useBrokerAction();
  const [amount, setAmount] = useState(
    vehicle.own_offer?.amount.toString() ?? "",
  );
  const [note, setNote] = useState(vehicle.own_offer?.note ?? "");
  const [reason, setReason] = useState("");
  const hold = vehicle.reservations.find((r) => r.status === "active");
  return (
    <section className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
      <h2 className="font-semibold">Your Offer</h2>
      <ActionFeedback error={error} success={success} />
      {vehicle.availability === "open" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act(vehicle.id, "offer", {
              amount: Number(amount),
              note,
              revision: vehicle.own_offer?.revision ?? 0,
            });
          }}
        >
          <FormField label="Offer price (INR)" required>
            <input
              required
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Note to SO">
            <textarea
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              rows={3}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="submit">
              <Send size={16} />
              {vehicle.own_offer?.status === "reconfirm"
                ? "Reconfirm offer"
                : vehicle.own_offer
                  ? "Update offer"
                  : "Submit offer"}
            </Button>
            {vehicle.own_offer?.status === "current" && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  act(vehicle.id, "withdraw_offer", {
                    revision: vehicle.own_offer!.revision,
                  })
                }
              >
                <X size={16} />
                Withdraw offer
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="text-sm text-zinc-500">
          {vehicle.availability === "reserved"
            ? "Offers are paused during this reservation."
            : "This vehicle is no longer accepting offers."}
        </p>
      )}
      {hold && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act(vehicle.id, "release", {
              reservation_id: hold.id,
              reason,
            });
          }}
        >
          <FormField label="Reason for releasing your reservation" required>
            <textarea
              required
              maxLength={2000}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          <Button variant="destructive" disabled={busy} type="submit">
            <X size={16} />
            Release reservation
          </Button>
        </form>
      )}
    </section>
  );
}
