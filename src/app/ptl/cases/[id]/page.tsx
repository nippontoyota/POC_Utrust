import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/formatCurrency";
import { formatLabel } from "@/lib/formatLabel";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Card, CardTitle } from "@/components/ui/Card";
import { DetailRow } from "@/components/ui/DetailRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StaffBrokerPanel } from "@/components/broker/StaffBrokerPanel";
import { AssignPoForm } from "@/components/ptl/AssignPoForm";
import type { Enums } from "@/lib/supabase/database.types";
import type { PtlCaseDetail, PtlBranchPo } from "@/lib/ptl";
import { shortCaseRef, vehicleLabel } from "@/lib/caseRef";
import { PanelBrokerBroadcastCard } from "@/components/ptl/PanelBrokerBroadcastCard";
import { PanelBrokerBidsLeaderboard } from "@/components/ptl/PanelBrokerBidsLeaderboard";
import type { PanelBrokerBid } from "@/lib/panelBrokers";

export default async function PtlCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("ptl_case", { p_case_id: id });
  const caseRow = data as unknown as PtlCaseDetail | null;
  if (!caseRow) notFound();

  const canAssign = caseRow.status === "pending_assignment" || caseRow.status === "pending_evaluation";
  const isBrokerStage = ["listed_for_brokers", "broker_offer_selected", "broker_deal_closed"].includes(caseRow.status);

  const [
    { data: photos },
    { data: offer },
    { data: events },
    { data: negotiations },
    { data: branchPos },
    { data: caseExtra },
    { data: panelBids },
  ] = await Promise.all([
    supabase.from("case_photos").select("id, category, file_size_bytes, is_plate_visible, broker_visible").eq("case_id", id).order("created_at"),
    supabase.from("case_offers").select("*").eq("case_id", id).maybeSingle(),
    supabase.from("case_events").select("*").eq("case_id", id).order("created_at"),
    supabase.from("case_negotiations").select("*").eq("case_id", id).order("round"),
    canAssign ? supabase.rpc("ptl_branch_pos", { p_branch_id: caseRow.branch_id }) : Promise.resolve({ data: null }),
    supabase.from("cases").select("broker_broadcast_at, color, branches(code)").eq("id", id).maybeSingle(),
    isBrokerStage ? supabase.rpc("get_panel_broker_bids", { p_case_id: id }) : Promise.resolve({ data: [] }),
  ]);

  const negs = negotiations ?? [];
  const latestNipponRevision = [...negs].reverse().find((n) => n.direction === "nippon_revised");
  const latestCustomerCounter = [...negs].reverse().find((n) => n.direction === "customer_counter");
  const nipponOfferPrice = latestNipponRevision?.amount ?? offer?.offer_price ?? null;
  const customerCounterPrice = latestCustomerCounter?.amount ?? null;
  const customerCounterPending =
    customerCounterPrice !== null &&
    (!latestNipponRevision || (latestCustomerCounter?.round ?? 0) > (latestNipponRevision?.round ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/ptl/cases"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Cases
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{shortCaseRef(caseRow.case_ref) ?? "(draft case)"}</h1>
        </div>
        <StatusBadge status={caseRow.status as Enums<"case_status">} />
      </div>

      {canAssign && (
        <Card>
          <CardTitle>{caseRow.po_id ? "Reassign Purchase Officer" : "Assign a Purchase Officer"}</CardTitle>
          <AssignPoForm caseId={id} pos={(branchPos as unknown as PtlBranchPo[]) ?? []} currentPoId={caseRow.po_id} />
        </Card>
      )}

      <Card>
        <CardTitle>Case Ownership</CardTitle>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DetailRow label="Branch" value={caseRow.branch_name} />
          <DetailRow
            label="Sales Officer"
            value={caseRow.sales_officer_name ? `${caseRow.sales_officer_name} (${caseRow.sales_officer_employee_id})` : undefined}
          />
          <DetailRow
            label="Assigned PO"
            value={caseRow.po_name ? `${caseRow.po_name} (${caseRow.po_employee_id})` : "Unassigned"}
          />
          <DetailRow label="Submitted" value={caseRow.submitted_at ? new Date(caseRow.submitted_at).toLocaleString("en-IN") : undefined} />
        </div>
      </Card>

      <Card>
        <CardTitle>Customer &amp; Vehicle Details</CardTitle>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DetailRow label="Customer name" value={caseRow.customer_name} />
          <DetailRow label="Customer expected price" value={formatINR(caseRow.customer_expected_price)} />
          <DetailRow label="Vehicle registration number" value={caseRow.vehicle_reg_number} />
          <DetailRow label="Make" value={caseRow.make} />
          <DetailRow label="Model" value={caseRow.model} />
          <DetailRow label="Variant" value={caseRow.variant} />
          <DetailRow label="Year of manufacture" value={caseRow.registration_year?.toString()} />
          <DetailRow label="Fuel type" value={formatLabel(caseRow.fuel_type)} />
          <DetailRow label="Transmission" value={formatLabel(caseRow.transmission)} />
          <DetailRow label="Odometer (km)" value={caseRow.odometer_km?.toString()} />
          <DetailRow label="Ownership count" value={caseRow.ownership_count?.toString()} />
          <DetailRow
            label="Loan / hypothecation"
            value={caseRow.has_loan ? `Yes${caseRow.lender_note ? ` (${caseRow.lender_note})` : ""}` : "No"}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Vehicle Photos</CardTitle>
        <PhotoGallery photos={photos ?? []} />
      </Card>

      {offer && (
        <Card>
          <CardTitle>PO Evaluation</CardTitle>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailRow label="Physical inspection" value={offer.inspection_completed ? "Completed" : "Not completed"} />
            <DetailRow label="Nippon's offer" value={formatINR(nipponOfferPrice)} />
            {latestNipponRevision && <DetailRow label="Original offer" value={formatINR(offer.offer_price)} />}
            {customerCounterPrice !== null && (
              <DetailRow
                label="Customer's counter"
                value={`${formatINR(customerCounterPrice)}${customerCounterPending ? " (awaiting Nippon's response)" : ""}`}
              />
            )}
            <DetailRow label="Inspection notes" value={offer.inspection_notes ?? undefined} />
            <DetailRow label="Submitted at" value={new Date(offer.submitted_at).toLocaleString("en-IN")} />
          </div>
        </Card>
      )}
      {isBrokerStage && (
        <>
          <PanelBrokerBroadcastCard
            caseId={id}
            status={caseRow.status}
            broadcastAt={caseExtra?.broker_broadcast_at ?? null}
            branchName={caseRow.branch_name}
            branchCode={caseExtra?.branches?.code || "CO01B"}
            vehicleDetails={{
              make: caseRow.make,
              model: caseRow.model,
              variant: caseRow.variant,
              color: caseExtra?.color ?? null,
              registration_year: caseRow.registration_year,
              odometer_km: caseRow.odometer_km,
              ownership_count: caseRow.ownership_count,
              fuel_type: caseRow.fuel_type,
              transmission: caseRow.transmission,
              vehicle_reg_number: caseRow.vehicle_reg_number,
            }}
            photos={photos ?? []}
          />
          <PanelBrokerBidsLeaderboard
            caseId={id}
            initialBids={(panelBids as unknown as PanelBrokerBid[]) ?? []}
            status={caseRow.status}
          />
        </>
      )}

      <StaffBrokerPanel caseId={id} status={caseRow.status as Enums<"case_status">} readOnly />
      <Card as="section" aria-label="Activity Log">
        <CardTitle>Activity Log</CardTitle>
        <ol className="space-y-0">
          {(events ?? []).map((e, i, arr) => (
            <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
              <div className="flex flex-col items-center">
                <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400" />
                {i < arr.length - 1 && <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pb-1">
                <div className="min-w-0 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                  <p>{formatLabel(e.event_type)}</p>
                  {e.actor_role && <p className="text-xs text-zinc-500">{formatLabel(e.actor_role)}</p>}
                  {e.notes && <p className="break-words">{e.notes}</p>}
                </div>
                <time dateTime={e.created_at} className="whitespace-nowrap text-xs text-zinc-400 dark:text-zinc-500">
                  {new Date(e.created_at).toLocaleString("en-IN")}
                </time>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
