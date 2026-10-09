import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PoCaseWorkspace } from "@/components/po/PoCaseWorkspace";

export default async function PoCaseDetailPage({
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
      .select("id, category, file_size_bytes")
      .eq("case_id", id)
      .order("created_at"),
    supabase.from("case_offers").select("*").eq("case_id", id).maybeSingle(),
  ]);

  return <PoCaseWorkspace caseRow={caseRow} photos={photos ?? []} offer={offer ?? null} />;
}
