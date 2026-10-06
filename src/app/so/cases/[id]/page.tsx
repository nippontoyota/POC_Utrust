import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CaseWorkspace } from "@/components/so/CaseWorkspace";
import { StaffBrokerPanel } from "@/components/broker/StaffBrokerPanel";

export default async function SoCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase.from("cases").select("*").eq("id", id).single();

  if (!caseRow) notFound();

  const [{ data: photos }, { data: offer }] = await Promise.all([
    supabase
      .from("case_photos")
      .select("id, category, storage_path, file_size_bytes, mime_type, created_at, broker_visible, is_plate_visible")
      .eq("case_id", id)
      .order("created_at"),
    supabase.from("case_offers").select("*").eq("case_id", id).maybeSingle(),
  ]);

  const hasApprovedBrokerPhoto = (photos ?? []).some((p) => p.broker_visible && !p.is_plate_visible);

  return (
    <>
      <CaseWorkspace
        initialCase={caseRow}
        initialPhotos={photos ?? []}
        offer={offer ?? null}
        hasApprovedBrokerPhoto={hasApprovedBrokerPhoto}
      />
      <StaffBrokerPanel caseId={id} status={caseRow.status} />
    </>
  );
}
