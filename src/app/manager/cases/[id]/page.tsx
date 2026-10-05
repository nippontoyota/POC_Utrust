import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/formatCurrency";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Card, CardTitle } from "@/components/ui/Card";
import { DetailRow } from "@/components/ui/DetailRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StaffBrokerPanel } from "@/components/broker/StaffBrokerPanel";

export default async function ManagerCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from("cases")
    .select("*, branches(name), sales_officer:profiles!cases_sales_officer_id_fkey(full_name, employee_id), po:profiles!cases_assigned_po_id_fkey(full_name, employee_id)")
    .eq("id", id)
    .single();

  if (!caseRow) notFound();

  const [{ data: photos }, { data: offer }, { data: events }] = await Promise.all([
    supabase.from("case_photos").select("id, category, file_size_bytes").eq("case_id", id).order("created_at"),
    supabase.from("case_offers").select("*").eq("case_id", id).maybeSingle(),
    supabase.from("case_events").select("*").eq("case_id", id).order("created_at"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/manager/cases"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Cases
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{caseRow.case_ref ?? "(draft case)"}</h1>
        </div>
        <StatusBadge status={caseRow.status} />
      </div>

      <Card>
        <CardTitle>Case Ownership</CardTitle>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <DetailRow label="Branch" value={caseRow.branches?.name} />
          <DetailRow
            label="Sales Officer"
            value={caseRow.sales_officer ? `${caseRow.sales_officer.full_name} (${caseRow.sales_officer.employee_id})` : undefined}
          />
          <DetailRow
            label="Assigned PO"
            value={caseRow.po ? `${caseRow.po.full_name} (${caseRow.po.employee_id})` : undefined}
          />
          <DetailRow label="Created" value={new Date(caseRow.created_at).toLocaleString("en-IN")} />
        </div>
      </Card>

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
        <PhotoGallery photos={photos ?? []} />
      </Card>

      {offer && (
        <Card>
          <CardTitle>PO Evaluation</CardTitle>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailRow label="Physical inspection" value={offer.inspection_completed ? "Completed" : "Not completed"} />
            <DetailRow label="Nippon's offer" value={formatINR(offer.offer_price)} />
            <DetailRow label="Inspection notes" value={offer.inspection_notes ?? undefined} />
            <DetailRow label="Submitted at" value={new Date(offer.submitted_at).toLocaleString("en-IN")} />
            {caseRow.customer_expected_price != null && (
              <DetailRow
                label="Difference from customer expectation"
                value={formatINR(offer.offer_price - caseRow.customer_expected_price)}
              />
            )}
          </div>
        </Card>
      )}

      {caseRow.customer_decision && (
        <Card>
          <CardTitle>Customer Decision</CardTitle>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <DetailRow label="Decision" value={caseRow.customer_decision} />
            <DetailRow
              label="Recorded at"
              value={caseRow.customer_decision_at ? new Date(caseRow.customer_decision_at).toLocaleString("en-IN") : undefined}
            />
            {caseRow.customer_decision === "rejected" && (
              <DetailRow label="Broker listing consent" value={caseRow.broker_consent === null ? undefined : caseRow.broker_consent ? "Yes" : "No"} />
            )}
            {caseRow.closed_at && <DetailRow label="Closed at" value={new Date(caseRow.closed_at).toLocaleString("en-IN")} />}
            {caseRow.cancelled_reason && <DetailRow label="Cancellation reason" value={caseRow.cancelled_reason} />}
            {caseRow.withdrawn_reason && <DetailRow label="Withdrawal reason" value={caseRow.withdrawn_reason} />}
          </div>
        </Card>
      )}

      <StaffBrokerPanel caseId={id} status={caseRow.status} readOnly />
      <Card as="section" aria-label="Activity Log">
        <CardTitle>Activity Log</CardTitle>
        <ol className="space-y-0">
          {(events ?? []).map((e, i, arr) => {
            const metadata = e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
              ? e.metadata
              : {};
            const amount = metadata.amount ?? metadata.offer_price;
            return (
              <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400" />
                  {i < arr.length - 1 && <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pb-1">
                  <div className="min-w-0 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                    <p className="capitalize">{e.event_type.replace(/_/g, " ")}</p>
                    {e.actor_role && <p className="text-xs capitalize text-zinc-500">{e.actor_role.replace(/_/g, " ")}</p>}
                    {typeof amount === "number" && <p>{formatINR(amount)}</p>}
                    {typeof metadata.decision === "string" && <p className="capitalize">Customer: {metadata.decision}</p>}
                    {typeof metadata.broker_consent === "boolean" && <p>Broker consent: {metadata.broker_consent ? "Yes" : "No"}</p>}
                    {e.notes && <p className="break-words">{e.notes}</p>}
                  </div>
                  <time dateTime={e.created_at} className="whitespace-nowrap text-xs text-zinc-400 dark:text-zinc-500">
                    {new Date(e.created_at).toLocaleString("en-IN")}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
