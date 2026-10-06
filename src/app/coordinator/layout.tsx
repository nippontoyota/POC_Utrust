import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  return (
    <AppShell
      roleLabel="Broker Coordinator"
      name={profile?.full_name ?? ""}
      subtitle="All branches"
      links={[{ href: "/coordinator/cases", label: "Cases", icon: "cases" }]}
    >
      {children}
    </AppShell>
  );
}
