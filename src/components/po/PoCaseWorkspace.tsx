"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ActionFeedback, useBrokerAction } from "@/components/broker/useBrokerAction";
import { formatINR } from "@/lib/formatCurrency";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DetailRow } from "@/components/ui/DetailRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/FormField";
import type { Tables } from "@/lib/supabase/database.types";

type CaseRow = Tables<"cases">;
type PhotoRow = Pick<Tables<"case_photos">, "id" | "category" | "file_size_bytes">;
type OfferRow = Tables<"case_offers">;

export function PoCaseWorkspace({
  caseRow,
  photos,
  offer,
}: {
  caseRow: CaseRow;
  photos: PhotoRow[];
  offer: OfferRow | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [inspectionCompleted, setInspectionCompleted] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAction = useBrokerAction();
  const canEvaluate = caseRow.status === "pending_evaluation" && !offer;

  async function handleSubmit() {
    setError(null);

    const price = parseFloat(offerPrice);
    if (!inspectionCompleted) {
      setError("You must confirm the physical inspection is complete.");
      return;
    }
    if (!Number.isFinite(price) || price < 1 || price > 999999999) {
      setError("Enter an offer price between INR 1 and INR 99,99,99,999.");
      return;
    }

    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc("submit_po_evaluation", {
      p_case_id: caseRow.id,
      p_inspection_completed: inspectionCompleted,
      p_inspection_notes: inspectionNotes || null,
      p_offer_price: price,
    });
    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-6">
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

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardTitle>Customer &amp; Vehicle Details</CardTitle>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DetailRow label="Customer name" value={caseRow.customer_name} />
          <DetailRow label="Customer mobile number" value={caseRow.customer_mobile} />
          <DetailRow label="Vehicle registration number" value={caseRow.vehicle_reg_number} />
          <DetailRow label="Make" value={caseRow.make} />
          <DetailRow label="Model" value={caseRow.model} />
          <DetailRow label="Variant" value={caseRow.variant} />
          <DetailRow label="Registration year" value={caseRow.registration_year?.toString()} />
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

      <Card>
        <CardTitle>Vehicle Photos</CardTitle>
        <PhotoGallery photos={photos} />
      </Card>

      <ActionFeedback error={startAction.error} success={startAction.success} />
      {canEvaluate && !caseRow.evaluation_started_at && <Button disabled={startAction.busy} onClick={() => startAction.run("start_po_evaluation", { p_case_id: caseRow.id })}>Start Evaluation</Button>}
      {caseRow.evaluation_started_at && <p className="text-sm text-zinc-500">{offer ? "Evaluation started" : "Evaluation in progress since"} {new Date(caseRow.evaluation_started_at).toLocaleString("en-IN")}</p>}
      {offer ? (
        <Card>
          <CardTitle>Your Evaluation</CardTitle>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailRow label="Physical inspection" value={offer.inspection_completed ? "Completed" : "Not completed"} />
            <DetailRow label="Nippon's offer" value={formatINR(offer.offer_price)} />
            <DetailRow label="Inspection notes" value={offer.inspection_notes ?? "—"} />
            <DetailRow label="Submitted at" value={new Date(offer.submitted_at).toLocaleString("en-IN")} />
          </div>
        </Card>
      ) : canEvaluate && caseRow.evaluation_started_at ? (
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
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Inspection notes (optional)
            </label>
            <textarea
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              rows={3}
              className={`mt-1 w-full ${inputClass}`}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Nippon&apos;s offered price (INR) <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={999999999}
              step={1}
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
              className={inputClass}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!inspectionCompleted || submitting}
            title={!inspectionCompleted ? "Confirm physical inspection first" : undefined}
            className="mt-5"
          >
            {submitting ? "Submitting..." : "Submit Evaluation & Offer"}
          </Button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            This is final once submitted — offers cannot be revised.
          </p>
        </Card>
      ) : (
        <EmptyState message={canEvaluate ? "Awaiting evaluation." : "This case is not currently awaiting your evaluation."} />
      )}
    </div>
  );
}
