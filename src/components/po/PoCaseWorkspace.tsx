"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Camera, X, Clock, CheckCircle2,
  AlertTriangle, ChevronDown, ChevronUp, Eye, EyeOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/formatCurrency";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DetailRow } from "@/components/ui/DetailRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/FormField";
import { ActionFeedback, useBrokerAction } from "@/components/broker/useBrokerAction";
import type { Tables } from "@/lib/supabase/database.types";

type CaseRow = Tables<"cases">;
type PhotoRow = Pick<
  Tables<"case_photos">,
  "id" | "category" | "storage_path" | "file_size_bytes" | "mime_type" | "created_at" | "broker_visible" | "is_plate_visible"
>;
type OfferRow = Tables<"case_offers">;
type NegotiationRow = Tables<"case_negotiations">;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_PHOTOS = 10;

// ─── Countdown helpers ────────────────────────────────────────────────────────

function useCountdown(deadlineIso: string | null | undefined) {
  const [remaining, setRemaining] = useState<number>(() =>
    deadlineIso ? Date.parse(deadlineIso) - Date.now() : -1
  );

  useEffect(() => {
    if (!deadlineIso) return;
    const tick = () => setRemaining(Date.parse(deadlineIso) - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return remaining; // ms remaining; ≤0 means expired
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h ${m}m`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function countdownColorClass(ms: number): string {
  if (ms <= 0) return "text-red-600 dark:text-red-400";
  if (ms < 6 * 3600 * 1000) return "text-red-500 dark:text-red-400";
  if (ms < 24 * 3600 * 1000) return "text-amber-500 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PoCaseWorkspace({
  caseRow,
  photos: initialPhotos,
  offer,
  negotiations: initialNegotiations,
}: {
  caseRow: CaseRow;
  photos: PhotoRow[];
  offer: OfferRow | null;
  negotiations: NegotiationRow[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const CURRENT_YEAR = new Date().getFullYear();
  const MIN_REGISTRATION_YEAR = 1980;
  const REGISTRATION_YEARS = Array.from(
    { length: CURRENT_YEAR - MIN_REGISTRATION_YEAR + 1 },
    (_, i) => CURRENT_YEAR - i
  );

  // ── Evaluation form state ─────────────────────────────────────────────────
  const [inspectionCompleted, setInspectionCompleted] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [registrationYear, setRegistrationYear] = useState(caseRow.registration_year?.toString() ?? "");
  const [ownershipCount, setOwnershipCount] = useState(caseRow.ownership_count?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAction = useBrokerAction();
  const canEvaluate = caseRow.status === "pending_evaluation" && !offer;

  async function handleSubmit() {
    setError(null);
    const price = parseFloat(offerPrice);
    const year = parseInt(registrationYear, 10);
    const owners = parseInt(ownershipCount, 10);
    if (!inspectionCompleted) { setError("You must confirm the physical inspection is complete."); return; }
    if (!Number.isFinite(price) || price < 1 || price > 999999999) { setError("Enter an offer price between INR 1 and INR 99,99,99,999."); return; }
    if (!Number.isInteger(year) || year < MIN_REGISTRATION_YEAR || year > CURRENT_YEAR) { setError(`Model year must be between ${MIN_REGISTRATION_YEAR} and ${CURRENT_YEAR}.`); return; }
    if (!Number.isInteger(owners) || owners < 1 || owners > 10) { setError("Ownership count must be between 1 and 10."); return; }
    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc("submit_po_evaluation", {
      p_case_id: caseRow.id,
      p_inspection_completed: inspectionCompleted,
      p_inspection_notes: inspectionNotes || null,
      p_offer_price: price,
      p_registration_year: year,
      p_ownership_count: owners,
    });
    setSubmitting(false);
    if (rpcError) { setError(rpcError.message); return; }
    router.refresh();
  }

  // ── 72-hour countdown ─────────────────────────────────────────────────────
  const remaining = useCountdown(caseRow.offer_deadline_at);
  const isExpired = caseRow.offer_deadline_at ? remaining <= 0 : false;
  const isPendingDecision = caseRow.status === "pending_customer_decision";

  // ── Expire window action ─────────────────────────────────────────────────
  const [expirySubmitting, setExpirySubmitting] = useState(false);
  const [showExpiryConfirm, setShowExpiryConfirm] = useState(false);

  async function handleExpireWindow() {
    setExpirySubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("expire_customer_decision", { p_case_id: caseRow.id });
    setExpirySubmitting(false);
    if (rpcError) { setError(rpcError.message); return; }
    setShowExpiryConfirm(false);
    router.refresh();
  }

  // ── Negotiation state ─────────────────────────────────────────────────────
  const [negotiations, setNegotiations] = useState<NegotiationRow[]>(initialNegotiations);
  const [negDirection, setNegDirection] = useState<"customer_counter" | "nippon_revised">("customer_counter");
  const [negAmount, setNegAmount] = useState("");
  const [negNote, setNegNote] = useState("");
  const [negSubmitting, setNegSubmitting] = useState(false);

  async function handleAddNegotiationRound() {
    const amount = parseFloat(negAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount >= 10000000000) {
      setError("Enter a valid amount between INR 1 and INR 99,99,99,999.");
      return;
    }
    setNegSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("record_negotiation_round", {
      p_case_id: caseRow.id,
      p_direction: negDirection,
      p_amount: amount,
      p_note: negNote.trim() || null,
    });
    setNegSubmitting(false);
    if (rpcError) { setError(rpcError.message); return; }
    if (data) setNegotiations((prev) => [...prev, data as NegotiationRow]);
    setNegAmount("");
    setNegNote("");
  }

  // ── Pending decision: accept / reject ────────────────────────────────────
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | "accept" | "reject">(null);

  async function runDecision(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setDecisionSubmitting(true);
    const { error: rpcError } = await fn();
    setDecisionSubmitting(false);
    if (rpcError) { setError(rpcError.message); return; }
    setPendingAction(null);
    router.refresh();
  }

  function confirmAccept() {
    runDecision(() => supabase.rpc("record_customer_decision", { p_case_id: caseRow.id, p_decision: "accepted" }));
  }

  function confirmReject(consent: boolean) {
    runDecision(() =>
      supabase.rpc("record_customer_decision", { p_case_id: caseRow.id, p_decision: "rejected", p_broker_consent: consent })
    );
  }

  // ── Photo management (listed_for_brokers) ────────────────────────────────
  const [photos, setPhotos] = useState<PhotoRow[]>(initialPhotos);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [togglingPhoto, setTogglingPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isListedForBrokers = caseRow.status === "listed_for_brokers";
  const nonRcPhotos = photos.filter((p) => p.category !== "rc_book");

  async function handlePoPhotoSelect(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) { setError("Only image files are allowed."); return; }
    if (file.size > MAX_FILE_BYTES) { setError("Each photo must be 5 MB or smaller."); return; }
    if (nonRcPhotos.length >= MAX_TOTAL_PHOTOS) {
      setError(`You can upload at most ${MAX_TOTAL_PHOTOS} vehicle photos.`);
      return;
    }
    setUploadingPhoto(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const photoId = crypto.randomUUID();
    const path = `${caseRow.id}/${photoId}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("vehicle-photos").upload(path, file);
    if (uploadError) { setError(uploadError.message); setUploadingPhoto(false); return; }
    const { data: photoRow, error: insertError } = await supabase
      .from("case_photos")
      .insert({
        case_id: caseRow.id,
        storage_path: path,
        category: "other",
        is_plate_visible: false,
        file_size_bytes: file.size,
        mime_type: file.type,
        uploaded_by: caseRow.assigned_po_id,
      })
      .select("id, category, storage_path, file_size_bytes, mime_type, created_at, broker_visible, is_plate_visible")
      .single();
    setUploadingPhoto(false);
    if (insertError || !photoRow) {
      await supabase.storage.from("vehicle-photos").remove([path]);
      setError(insertError?.message ?? "Failed to record photo");
      return;
    }
    setPhotos((prev) => [...prev, photoRow as PhotoRow]);
  }

  async function handleRemovePoPhoto(photo: PhotoRow) {
    await supabase.storage.from("vehicle-photos").remove([photo.storage_path]);
    await supabase.from("case_photos").delete().eq("id", photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  }

  async function handleToggleBrokerVisible(photo: PhotoRow) {
    setTogglingPhoto(photo.id);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("set_photo_broker_visibility", {
      p_photo_id: photo.id,
      p_visible: !photo.broker_visible,
    });
    setTogglingPhoto(null);
    if (rpcError) { setError(rpcError.message); return; }
    if (data) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, broker_visible: (data as PhotoRow).broker_visible } : p))
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/po/cases"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Assigned Cases
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{caseRow.case_ref}</h1>
        </div>
        <StatusBadge status={caseRow.status} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Case Details ── */}
      <Card>
        <CardTitle>Customer &amp; Vehicle Details</CardTitle>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DetailRow label="Customer name" value={caseRow.customer_name} />
          <DetailRow label="Customer mobile number" value={caseRow.customer_mobile} />
          <DetailRow label="Vehicle registration number" value={caseRow.vehicle_reg_number} />
          <DetailRow label="Make" value={caseRow.make} />
          <DetailRow label="Model" value={caseRow.model} />
          <DetailRow label="Variant" value={caseRow.variant} />
          <DetailRow label="Colour" value={caseRow.color} />
          <DetailRow label="Model year" value={caseRow.registration_year?.toString()} />
          <DetailRow label="Fuel type" value={caseRow.fuel_type} />
          <DetailRow label="Transmission" value={caseRow.transmission} />
          <DetailRow label="Odometer (km)" value={caseRow.odometer_km?.toString()} />
          <DetailRow label="Ownership count" value={caseRow.ownership_count?.toString()} />
          <DetailRow
            label="Loan / hypothecation"
            value={caseRow.has_loan ? `Yes${caseRow.lender_note ? ` (${caseRow.lender_note})` : ""}` : "No"}
          />
          <DetailRow label="Customer expected price" value={formatINR(caseRow.customer_expected_price)} />
        </div>
      </Card>

      {/* ── Vehicle Photos (read-only for PO during evaluation) ── */}
      {caseRow.status !== "listed_for_brokers" && (
        <Card>
          <CardTitle>Vehicle Photos</CardTitle>
          <PhotoGalleryPo photos={photos} />
        </Card>
      )}

      {/* ── Evaluation start / submit ── */}
      <ActionFeedback error={startAction.error} success={startAction.success} />
      {canEvaluate && !caseRow.evaluation_started_at && (
        <Button disabled={startAction.busy} onClick={() => startAction.run("start_po_evaluation", { p_case_id: caseRow.id })}>
          Start Evaluation
        </Button>
      )}
      {caseRow.evaluation_started_at && (
        <p className="text-sm text-zinc-500">
          {offer ? "Evaluation started" : "Evaluation in progress since"}{" "}
          {new Date(caseRow.evaluation_started_at).toLocaleString("en-IN")}
        </p>
      )}

      {/* ── Evaluation submitted: show offer summary ── */}
      {offer && (
        <Card>
          <CardTitle>Your Evaluation</CardTitle>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailRow label="Physical inspection" value={offer.inspection_completed ? "Completed" : "Not completed"} />
            <DetailRow label="Nippon's offer" value={formatINR(offer.offer_price)} />
            <DetailRow label="Inspection notes" value={offer.inspection_notes ?? "—"} />
            <DetailRow label="Submitted at" value={new Date(offer.submitted_at).toLocaleString("en-IN")} />
          </div>
        </Card>
      )}

      {/* ── Evaluation form ── */}
      {!offer && canEvaluate && caseRow.evaluation_started_at && (
        <Card>
          <CardTitle>Evaluation &amp; Offer</CardTitle>

          <label className="flex items-start gap-2 text-sm text-zinc-900 dark:text-zinc-100">
            <input
              type="checkbox"
              checked={inspectionCompleted}
              onChange={(e) => setInspectionCompleted(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span>
              I confirm the physical inspection of this vehicle is complete.
              <span className="text-red-500 dark:text-red-400"> *</span>
            </span>
          </label>

          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Inspection notes (optional)</label>
            <textarea value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} rows={3} className={`mt-1 w-full ${inputClass}`} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Model year <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select value={registrationYear} onChange={(e) => setRegistrationYear(e.target.value)} className={`mt-1 ${inputClass}`}>
                <option value="">Select...</option>
                {REGISTRATION_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Ownership count <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input type="number" min={1} max={10} step={1} value={ownershipCount} onChange={(e) => setOwnershipCount(e.target.value)} className={`mt-1 ${inputClass}`} />
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Verify and fill in the SO-reported model year and ownership count — both affect valuation.</p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Nippon&apos;s offered price (INR) <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input type="number" min={1} max={999999999} step={1} value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} className={inputClass} />
          </div>

          <Button onClick={handleSubmit} disabled={!inspectionCompleted || submitting} title={!inspectionCompleted ? "Confirm physical inspection first" : undefined} className="mt-5">
            {submitting ? "Submitting..." : "Submit Evaluation & Offer"}
          </Button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">This is final once submitted — offers cannot be revised.</p>
        </Card>
      )}

      {/* ─── PENDING CUSTOMER DECISION ─────────────────────────────────────── */}
      {isPendingDecision && offer && (
        <>
          {/* 72-hour Countdown Banner */}
          <div
            className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 ${
              isExpired
                ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
                : remaining < 24 * 3600 * 1000
                ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                : "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className={`h-5 w-5 shrink-0 ${countdownColorClass(remaining)}`} />
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">72-Hour Decision Window</p>
                {caseRow.offer_deadline_at && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Deadline: {new Date(caseRow.offer_deadline_at).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            </div>
            <span className={`font-mono text-2xl font-black tabular-nums tracking-tight ${countdownColorClass(remaining)}`}>
              {caseRow.offer_deadline_at ? formatCountdown(remaining) : "—"}
            </span>
          </div>

          {/* Offer Price */}
          <Card>
            <CardTitle>Nippon&apos;s Offer</CardTitle>
            <p className="mb-6 text-3xl font-black tabular-nums text-zinc-900 dark:text-zinc-50">
              {formatINR(offer.offer_price)}
            </p>

            {/* ── Negotiation Timeline ── */}
            <NegotiationTimeline
              negotiations={negotiations}
              offerPrice={offer.offer_price}
              canAdd={!isExpired}
              negDirection={negDirection}
              negAmount={negAmount}
              negNote={negNote}
              negSubmitting={negSubmitting}
              onDirectionChange={setNegDirection}
              onAmountChange={setNegAmount}
              onNoteChange={setNegNote}
              onSubmit={handleAddNegotiationRound}
            />

            {/* ── Accept / Reject ── */}
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Final Customer Decision</p>
              {pendingAction === "accept" ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                  <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                    Confirm the customer has accepted Nippon&apos;s offer?
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={confirmAccept} disabled={decisionSubmitting} className="bg-green-700 hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600">
                      {decisionSubmitting ? "Recording..." : "Yes, confirm"}
                    </Button>
                    <Button variant="secondary" onClick={() => setPendingAction(null)}>Cancel</Button>
                  </div>
                </div>
              ) : pendingAction === "reject" ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
                  <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                    Does the customer consent to listing this vehicle with brokers?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => confirmReject(true)} disabled={decisionSubmitting} className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500">
                      Yes, list with brokers
                    </Button>
                    <Button variant="destructive" onClick={() => confirmReject(false)} disabled={decisionSubmitting}>
                      No, do not list
                    </Button>
                    <Button variant="secondary" onClick={() => setPendingAction(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setPendingAction("accept")} className="bg-green-700 hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600">
                    Customer Accepted
                  </Button>
                  <Button variant="destructive" onClick={() => setPendingAction("reject")}>
                    Customer Rejected
                  </Button>
                </div>
              )}
            </div>

            {/* ── Expire Window ── */}
            {isExpired && (
              <div className="mt-5 border-t border-[var(--line)] pt-5">
                {showExpiryConfirm ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
                    <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      The 72-hour window has passed. Close this case as &ldquo;No Decision&rdquo;? This is final.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={handleExpireWindow} disabled={expirySubmitting}>
                        {expirySubmitting ? "Closing..." : "Yes, mark as expired"}
                      </Button>
                      <Button variant="secondary" onClick={() => setShowExpiryConfirm(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowExpiryConfirm(true)}
                    className="flex items-center gap-2 text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    72-hour window has expired — mark as No Decision
                  </button>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ─── LISTED FOR BROKERS: Photo Management ──────────────────────────── */}
      {isListedForBrokers && (
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <CardTitle>Photo Management for Broker Listing</CardTitle>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Toggle which photos brokers can see. RC book and number-plate photos are always hidden.
                Add up to {MAX_TOTAL_PHOTOS} vehicle photos total.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {photos.filter((p) => p.broker_visible).length} visible to brokers
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {photos.map((photo) => (
              <BrokerPhotoCard
                key={photo.id}
                photo={photo}
                toggling={togglingPhoto === photo.id}
                onToggle={() => handleToggleBrokerVisible(photo)}
                onRemove={photo.category !== "rc_book" ? () => handleRemovePoPhoto(photo) : undefined}
              />
            ))}

            {/* Add new photo slot */}
            {nonRcPhotos.length < MAX_TOTAL_PHOTOS && (
              <label
                className={`flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition ${
                  uploadingPhoto
                    ? "border-zinc-200 text-zinc-400 dark:border-zinc-800"
                    : "border-zinc-300 text-zinc-500 hover:border-blue-400 hover:bg-blue-50/50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500 dark:hover:bg-blue-950/20"
                }`}
              >
                <Camera className="h-5 w-5" strokeWidth={1.5} />
                <span>{uploadingPhoto ? "Uploading..." : "Add photo"}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={uploadingPhoto}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePoPhotoSelect(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </Card>
      )}

      {/* ─── Terminal status cards ──────────────────────────────────────────── */}
      {caseRow.status === "purchase_completion_pending" && (
        <Card className="border-blue-200 bg-blue-50 text-sm text-zinc-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-zinc-300">
          Customer accepted on{" "}
          {caseRow.customer_decision_at && new Date(caseRow.customer_decision_at).toLocaleString("en-IN")}.
          The Sales Officer will complete payment and paperwork.
        </Card>
      )}
      {caseRow.status === "rejected_not_listed" && (
        <Card className="text-sm text-zinc-600 dark:text-zinc-400">
          Customer rejected Nippon&apos;s offer and did not consent to broker listing.
        </Card>
      )}
      {caseRow.status === "no_customer_decision" && (
        <Card className="border-zinc-300 bg-zinc-50 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          No customer decision was recorded within the 72-hour window. This case has been closed.
        </Card>
      )}
      {caseRow.status === "closed" && (
        <Card className="border-green-200 bg-green-50 text-sm text-zinc-700 dark:border-green-900 dark:bg-green-950/30 dark:text-zinc-300">
          Closed on {caseRow.closed_at && new Date(caseRow.closed_at).toLocaleString("en-IN")}.
        </Card>
      )}
      {caseRow.status === "cancelled" && (
        <Card className="border-red-200 bg-red-50 text-sm text-zinc-700 dark:border-red-900 dark:bg-red-950/30 dark:text-zinc-300">
          Cancelled: {caseRow.cancelled_reason}
        </Card>
      )}
      {caseRow.status === "listed_for_brokers" && (
        <Card className="border-amber-200 bg-amber-50 text-sm text-zinc-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-zinc-300">
          Listed on the broker marketplace. Use the photo management panel above to control what brokers see.
        </Card>
      )}

      {!offer && !canEvaluate && caseRow.status === "pending_evaluation" && (
        <EmptyState message="This case is not currently awaiting your evaluation." />
      )}
    </div>
  );
}

// ─── Negotiation Timeline sub-component ──────────────────────────────────────

function NegotiationTimeline({
  negotiations,
  offerPrice,
  canAdd,
  negDirection,
  negAmount,
  negNote,
  negSubmitting,
  onDirectionChange,
  onAmountChange,
  onNoteChange,
  onSubmit,
}: {
  negotiations: NegotiationRow[];
  offerPrice: number;
  canAdd: boolean;
  negDirection: "customer_counter" | "nippon_revised";
  negAmount: string;
  negNote: string;
  negSubmitting: boolean;
  onDirectionChange: (d: "customer_counter" | "nippon_revised") => void;
  onAmountChange: (v: string) => void;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Negotiation Rounds
          {negotiations.length > 0 && (
            <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
              {negotiations.length}
            </span>
          )}
        </span>
        {collapsed ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronUp className="h-4 w-4 text-zinc-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-[var(--line)] px-4 pb-4 pt-3 space-y-4">
          {/* Timeline */}
          <div className="space-y-2">
            {/* Nippon's original offer as Round 0 */}
            <TimelineEntry
              round={0}
              direction="nippon_revised"
              amount={offerPrice}
              note="Nippon's original offer"
              recordedAt={null}
              isOrigin
            />
            {negotiations.map((n) => (
              <TimelineEntry
                key={n.id}
                round={n.round}
                direction={n.direction}
                amount={n.amount}
                note={n.note}
                recordedAt={n.recorded_at}
              />
            ))}
            {negotiations.length === 0 && (
              <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">No negotiation rounds recorded yet.</p>
            )}
          </div>

          {/* Add round form */}
          {canAdd && (
            <div className="rounded-xl border border-[var(--line)] bg-white p-3 dark:bg-zinc-900 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Add Round</p>

              {/* Direction toggle */}
              <div className="flex rounded-lg border border-[var(--line)] overflow-hidden text-sm">
                {(["customer_counter", "nippon_revised"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => onDirectionChange(dir)}
                    className={`flex-1 px-3 py-2 font-medium transition ${
                      negDirection === dir
                        ? dir === "customer_counter"
                          ? "bg-orange-500 text-white"
                          : "bg-blue-600 text-white"
                        : "bg-transparent text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {dir === "customer_counter" ? "🟠 Customer Counter" : "🔵 Nippon Revised"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Amount (INR)</label>
                  <input
                    type="number"
                    min={1}
                    max={999999999}
                    step={1}
                    value={negAmount}
                    onChange={(e) => onAmountChange(e.target.value)}
                    placeholder="e.g. 450000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Note (optional)</label>
                  <input
                    type="text"
                    maxLength={1000}
                    value={negNote}
                    onChange={(e) => onNoteChange(e.target.value)}
                    placeholder="Optional context"
                    className={inputClass}
                  />
                </div>
                <Button
                  onClick={onSubmit}
                  disabled={negSubmitting || !negAmount}
                  className="w-full sm:w-auto"
                >
                  {negSubmitting ? "Saving..." : "Record"}
                </Button>
              </div>
            </div>
          )}

          {!canAdd && (
            <p className="text-xs text-red-600 dark:text-red-400">
              The 72-hour window has expired. No more negotiation rounds can be added.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineEntry({
  round,
  direction,
  amount,
  note,
  recordedAt,
  isOrigin = false,
}: {
  round: number;
  direction: "customer_counter" | "nippon_revised";
  amount: number;
  note: string | null;
  recordedAt: string | null;
  isOrigin?: boolean;
}) {
  const isCustomer = direction === "customer_counter";
  return (
    <div className={`flex items-start gap-3 ${isCustomer ? "" : "flex-row-reverse"}`}>
      {/* Dot */}
      <div
        className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
          isOrigin ? "bg-zinc-400" : isCustomer ? "bg-orange-400" : "bg-blue-500"
        }`}
      />
      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
          isOrigin
            ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            : isCustomer
            ? "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200"
            : "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
        }`}
      >
        <div className="flex items-baseline gap-2">
          <span className="font-black tabular-nums">{formatINR(amount)}</span>
          {!isOrigin && (
            <span className="text-xs opacity-60">
              {isCustomer ? "Customer" : "Nippon"} · Round {round}
            </span>
          )}
          {isOrigin && <span className="text-xs opacity-60">Nippon's offer</span>}
        </div>
        {note && <p className="mt-0.5 text-xs opacity-75">{note}</p>}
        {recordedAt && (
          <p className="mt-0.5 text-xs opacity-50">{new Date(recordedAt).toLocaleString("en-IN")}</p>
        )}
      </div>
    </div>
  );
}

// ─── Broker Photo Card sub-component ────────────────────────────────────────

function BrokerPhotoCard({
  photo,
  toggling,
  onToggle,
  onRemove,
}: {
  photo: PhotoRow;
  toggling: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isRcBook = photo.category === "rc_book";
  const isPlate = photo.is_plate_visible;
  const alwaysHidden = isRcBook || isPlate;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/${photo.id}/signed-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.url) setUrl(data.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [photo.id]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border transition ${
        alwaysHidden
          ? "border-zinc-200 opacity-60 dark:border-zinc-800"
          : photo.broker_visible
          ? "border-green-400 ring-1 ring-green-400/30 dark:border-green-600"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {/* Thumbnail */}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.category} className="h-28 w-full object-cover" />
      ) : (
        <div className="h-28 w-full animate-pulse bg-zinc-100 dark:bg-zinc-800" />
      )}

      {/* Overlay info bar */}
      <div className="flex items-center justify-between gap-1 bg-white px-2 py-1.5 dark:bg-zinc-900">
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400 capitalize">
          {photo.category.replace(/_/g, " ")}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {/* Broker visibility toggle */}
          {alwaysHidden ? (
            <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-600">
              <EyeOff className="h-3.5 w-3.5" />
              {isRcBook ? "RC" : "Plate"}
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              disabled={toggling}
              title={photo.broker_visible ? "Hide from brokers" : "Show to brokers"}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition ${
                photo.broker_visible
                  ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {toggling ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : photo.broker_visible ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {photo.broker_visible ? "Visible" : "Hidden"}
            </button>
          )}

          {/* Remove button */}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="ml-1 rounded p-0.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              title="Remove photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Simple photo gallery for PO read-only view ───────────────────────────────

function PhotoGalleryPo({ photos }: { photos: PhotoRow[] }) {
  if (photos.length === 0) return <p className="text-sm text-zinc-500 dark:text-zinc-400">No photos uploaded.</p>;

  const CATEGORY_LABELS: Record<string, string> = {
    front: "Front", rear: "Rear", left: "Left side", right: "Right side",
    interior_odometer: "Interior / dashboard", other: "Additional",
    rc_book: "RC book / registration certificate",
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((photo) => (
        <PhotoThumbPo key={photo.id} photo={photo} label={CATEGORY_LABELS[photo.category] ?? photo.category} />
      ))}
    </div>
  );
}

function PhotoThumbPo({ photo, label }: { photo: PhotoRow; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/${photo.id}/signed-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data?.url) setUrl(data.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [photo.id]);

  return (
    <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</p>
      {url ? (
        <>
          <button type="button" onClick={() => dialog.current?.showModal()} className="block w-full" aria-label={`Enlarge ${label} photo`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="h-20 w-full rounded object-cover" />
          </button>
          <dialog ref={dialog} className="fixed m-auto max-h-[95dvh] w-[min(95vw,1000px)] rounded-lg bg-white p-4 backdrop:bg-black/70 dark:bg-zinc-900" aria-label={`${label} photo`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <button type="button" onClick={() => dialog.current?.close()} title="Close" aria-label="Close photo" className="p-2"><X size={20} /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="max-h-[78dvh] w-full object-contain" />
          </dialog>
        </>
      ) : (
        <div className="h-20 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      )}
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{(photo.file_size_bytes / 1024).toFixed(0)} KB</p>
    </div>
  );
}
