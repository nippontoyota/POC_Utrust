import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const { photoId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: photo } = await service
    .from("case_photos")
    .select("id, storage_path, category, is_plate_visible, broker_visible, case_id")
    .eq("id", photoId)
    .single();

  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: caseRow } = await service
    .from("cases")
    .select("id, sales_officer_id, assigned_po_id, branch_id, status, broker_consent")
    .eq("id", photo.case_id)
    .single();

  if (!caseRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: profile }, { data: broker }] = await Promise.all([
    service.from("profiles").select("role, branch_id, cluster_id, is_active").eq("id", user.id).maybeSingle(),
    service.from("brokers").select("status, suspended_at").eq("id", user.id).maybeSingle(),
  ]);

  let authorized = false;

  if (profile?.is_active) {
    if (profile.role === "sales_officer" && caseRow.sales_officer_id === user.id) authorized = true;
    if (profile.role === "purchase_officer" && caseRow.assigned_po_id === user.id) authorized = true;
    if (profile.role === "sales_manager" && profile.branch_id === caseRow.branch_id) authorized = true;
    if (profile.role === "po_manager" && caseRow.assigned_po_id !== null) authorized = true;
    if (profile.role === "cluster_manager") {
      const { data: branch } = await service.from("branches").select("cluster_id").eq("id", caseRow.branch_id).single();
      if (branch?.cluster_id === profile.cluster_id) authorized = true;
    }
    if (profile.role === "broker_coordinator" && caseRow.broker_consent) authorized = true;
  } else if (!profile && broker && broker.status === "approved" && !broker.suspended_at) {
    // Brokers only ever see plate-hidden photos on listed cases -- never the
    // reverse. This is the one place that rule is enforced, deliberately
    // centralized rather than duplicated across every caller.
    const listedStatuses = ["listed_for_brokers", "broker_offer_selected"];
    if (listedStatuses.includes(caseRow.status) && caseRow.broker_consent && photo.category !== "rc_book" && photo.broker_visible && !photo.is_plate_visible) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signed, error } = await service.storage
    .from("vehicle-photos")
    .createSignedUrl(photo.storage_path, 300);

  if (error || !signed) {
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
