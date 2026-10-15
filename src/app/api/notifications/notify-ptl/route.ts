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

  // Confirm this really is the submitting SO's own just-submitted case --
  // not just trusting whatever caseId the client sends.
  const { data: caseRow } = await service
    .from("cases")
    .select("id, branch_id, case_ref, make, model, variant")
    .eq("id", caseId)
    .eq("sales_officer_id", user.id)
    .eq("status", "pending_assignment")
    .maybeSingle();

  if (!caseRow) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const { data: branchPtlIds } = await service
    .from("ptl_branches")
    .select("ptl_id")
    .eq("branch_id", caseRow.branch_id);

  const { data: activePtls } = await service
    .from("profiles")
    .select("id")
    .eq("role", "ptl")
    .eq("is_active", true)
    .in("id", (branchPtlIds ?? []).map((r) => r.ptl_id));

  const ptlIds = (activePtls ?? []).map((p) => p.id);

  await sendPushToProfiles(ptlIds, {
    title: "New case to assign",
    body: `${caseRow.case_ref ?? vehicleLabel(caseRow.make, caseRow.model, caseRow.variant)} is waiting for a PO.`,
    url: `/ptl/cases/${caseRow.id}`,
  });

  return NextResponse.json({ ok: true });
}
