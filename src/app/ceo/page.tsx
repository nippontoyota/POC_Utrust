import { createClient } from "@/lib/supabase/server";
import { CeoDashboard } from "@/components/ceo/CeoDashboard";
import type { CeoOverview } from "@/lib/ceo";

export default async function CeoDashboardPage() {
  const supabase = await createClient();

  const [{ data, error }, { data: branches }] = await Promise.all([
    supabase.rpc("ceo_overview", {}),
    supabase.from("branches").select("id, name").order("display_order"),
  ]);

  if (error || !data) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
        Could not load the dashboard: {error?.message ?? "No data returned."}
      </div>
    );
  }

  return <CeoDashboard overview={data as unknown as CeoOverview} branches={branches ?? []} />;
}
