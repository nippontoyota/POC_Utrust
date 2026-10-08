import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PoCaseWorkspace } from "@/components/po/PoCaseWorkspace";
import { StaffBrokerPanel } from "@/components/broker/StaffBrokerPanel";

export default async function PoCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase.from("cases").select("*").eq("id", id).single();
  if (!caseRow) notFound();

  const { data: photos } = await supabase
    .from("case_photos")
    .select("id, category, storage_path, file_size_bytes, mime_type, created_at, broker_visible, is_plate_visible")
    .eq("case_id", id)
    .order("created_at");

  return (
    <>
      <PoCaseWorkspace initialCase={caseRow} initialPhotos={photos ?? []} />
      <StaffBrokerPanel caseId={id} status={caseRow.status} readOnly />
    </>
  );
}
