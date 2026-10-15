import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToProfiles } from "@/lib/push.server";
import { vehicleLabel } from "@/lib/caseRef";

export async function POST(request: Request) {
  const { caseId } = (await request.json().catch(() => ({}))) as { caseId?: string };
  if (!caseId) {
    return NextResponse.json({ error: "Missing caseId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const service = createServiceClient();

  // Confirm the caller is actually an active PTL covering this case's
  // branch, and that the case now has an assigned PO to notify.
  const { data: caseRow } = await service
    .from("cases")
    .select("id, branch_id, assigned_po_id, case_ref, make, model, variant")
    .eq("id", caseId)
    .eq("status", "pending_evaluation")
    .not("assigned_po_id", "is", null)
    .maybeSingle();

  if (!caseRow || !caseRow.assigned_po_id) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const { data: ptl } = await service
    .from("ptl_branches")
    .select("ptl_id")
    .eq("ptl_id", user.id)
    .eq("branch_id", caseRow.branch_id)
    .maybeSingle();

  if (!ptl) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await sendPushToProfiles([caseRow.assigned_po_id], {
    title: "New case assigned to you",
    body: `${caseRow.case_ref ?? vehicleLabel(caseRow.make, caseRow.model, caseRow.variant)} is ready for evaluation.`,
    url: `/po/cases/${caseRow.id}`,
  });

  return NextResponse.json({ ok: true });
}
