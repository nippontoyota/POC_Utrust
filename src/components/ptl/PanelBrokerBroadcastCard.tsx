"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2, AlertCircle, Eye, EyeOff, Check } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  buildWhatsAppBroadcastMessage,
  type VehicleBroadcastDetails,
} from "@/lib/panelBrokers";

export type PhotoItem = {
  id: string;
  category: string;
  is_plate_visible?: boolean | null;
  broker_visible?: boolean | null;
};

function BroadcastPhotoThumbnail({
  photo,
  isSelected,
  onToggle,
  disabled,
}: {
  photo: PhotoItem;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/${photo.id}/signed-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.url) setUrl(data.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.id]);

  const isPlateFlagged = Boolean(photo.is_plate_visible);

  return (
    <div
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border transition ${
        isSelected
          ? "border-emerald-500 ring-2 ring-emerald-500/30 dark:border-emerald-500"
          : "border-[var(--line)] opacity-60 hover:opacity-100"
      }`}
    >
      <div className="relative h-28 w-full bg-zinc-100 dark:bg-zinc-800">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={photo.category}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            Loading...
          </div>
        )}

        {/* Checkbox indicator */}
        <div
          className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-md border text-white transition ${
            isSelected
              ? "border-emerald-600 bg-emerald-600"
              : "border-white/80 bg-black/40 group-hover:bg-black/60"
          }`}
        >
          {isSelected && <Check className="size-4 stroke-[3]" />}
        </div>

        {isPlateFlagged && (
          <div className="absolute bottom-1 left-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Plate Visible
          </div>
        )}
      </div>

      <div className="bg-[var(--panel-soft)] px-2.5 py-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="font-semibold capitalize text-zinc-800 dark:text-zinc-200">
            {photo.category.replace(/_/g, " ")}
          </span>
          <span
            className={`font-medium ${
              isSelected ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]"
            }`}
          >
            {isSelected ? "Approved" : "Excluded"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PanelBrokerBroadcastCard({
  caseId,
  status,
  broadcastAt: initialBroadcastAt,
  branchName,
  branchCode,
  vehicleDetails,
  photos,
}: {
  caseId: string;
  status: string;
  broadcastAt: string | null;
  branchName: string;
  branchCode: string;
  vehicleDetails: {
    make: string | null;
    model: string | null;
    variant: string | null;
    color: string | null;
    registration_year: number | null;
    odometer_km: number | null;
    ownership_count: number | null;
    fuel_type: string | null;
    transmission: string | null;
    vehicle_reg_number: string | null;
  };
  photos: PhotoItem[];
}) {
  const router = useRouter();
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastAt, setBroadcastAt] = useState<string | null>(initialBroadcastAt);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Filter out RC book photos permanently
  const eligiblePhotos = photos.filter((p) => p.category !== "rc_book");

  // Initial selection: plate-hidden photos (up to 4)
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>(() =>
    eligiblePhotos.filter((p) => !p.is_plate_visible).slice(0, 4).map((p) => p.id)
  );

  const isEligible = ["listed_for_brokers", "broker_offer_selected"].includes(status);
  if (!isEligible) return null;

  function togglePhoto(id: string) {
    if (broadcastAt) return;
    setSelectedPhotoIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  }

  // Construct live WhatsApp preview text
  const previewText = buildWhatsAppBroadcastMessage({
    ...vehicleDetails,
    branch_name: branchName,
    branch_code: branchCode,
    photoCount: selectedPhotoIds.length,
  });

  async function handleExecuteBroadcast() {
    if (selectedPhotoIds.length === 0) {
      setError("Please approve at least one plate-hidden photo before broadcasting.");
      setConfirmOpen(false);
      return;
    }

    setBroadcasting(true);
    setError(null);
    setFeedback(null);

    try {
      const res = await fetch("/api/panel-brokers/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          photoIds: selectedPhotoIds,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to broadcast");
      }

      setBroadcastAt(data.broadcastAt || new Date().toISOString());
      setFeedback(data.message || `Broadcast dispatched to ${data.sentCount} panel brokers.`);
      setConfirmOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <Card className="border-[var(--line)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div>
          <CardTitle>Panel Broker WhatsApp Broadcast Review</CardTitle>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Review vehicle photos to confirm registration plate is hidden, verify the message copy, and post to panel brokers.
          </p>
        </div>
        {broadcastAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" /> Broadcast Sent
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Awaiting Broadcast
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: Photo Verification */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              1. Review Vehicle Photos ({selectedPhotoIds.length}/{eligiblePhotos.length} Approved)
            </h3>
            <span className="text-[11px] text-[var(--muted)]">
              Click photo to toggle approval
            </span>
          </div>

          <p className="text-xs text-[var(--muted)]">
            Verify that vehicle number plates are strictly masked or hidden before sending to brokers.
          </p>

          {eligiblePhotos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-xs text-[var(--muted)]">
              No inspection vehicle photos uploaded for this case yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {eligiblePhotos.map((photo) => (
                <BroadcastPhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  isSelected={selectedPhotoIds.includes(photo.id)}
                  onToggle={() => togglePhoto(photo.id)}
                  disabled={Boolean(broadcastAt) || broadcasting}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Live WhatsApp Message Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              2. WhatsApp Message Live Preview
            </h3>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              DoubleTick Template
            </span>
          </div>

          {/* Chat Bubble Container */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
              <span>Recipients: 3 Verified Test Brokers</span>
              <span>Clean / No Emojis</span>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-white p-4 font-mono text-xs leading-relaxed text-zinc-800 shadow-inner dark:bg-zinc-900 dark:text-zinc-200">
              <pre className="whitespace-pre-wrap font-sans">{previewText}</pre>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
              <span>Shiva (9995228904) · Dev (8086186336) · Bharath (7591986822)</span>
              <span>All Branches</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        {broadcastAt ? (
          <p className="text-xs text-[var(--muted)]">
            Broadcasted on <strong className="text-zinc-800 dark:text-zinc-200" suppressHydrationWarning>{new Date(broadcastAt).toLocaleString("en-IN")}</strong>. This one-time broadcast is locked to prevent duplicate messaging.
          </p>
        ) : confirmOpen ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Broadcast to panel brokers via WhatsApp with {selectedPhotoIds.length} approved photos?
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={broadcasting}
                onClick={handleExecuteBroadcast}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2"
              >
                <Send className="size-3.5" />
                {broadcasting ? "Broadcasting..." : "Yes, Broadcast Now"}
              </Button>
              <button
                type="button"
                disabled={broadcasting}
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-[var(--panel-soft)] dark:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--muted)]">
              Confirm registration number is hidden in all {selectedPhotoIds.length} approved photos before posting.
            </p>
            <Button
              type="button"
              disabled={broadcasting || selectedPhotoIds.length === 0}
              onClick={() => {
                if (selectedPhotoIds.length === 0) {
                  setError("Please approve at least one plate-hidden photo before broadcasting.");
                  return;
                }
                setError(null);
                setConfirmOpen(true);
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5"
            >
              <Send className="size-4" />
              {broadcasting ? "Posting..." : "Post to Panel Brokers"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
