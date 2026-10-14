import { getCurrentProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function PtlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: branches } = profile
    ? await supabase.from("ptl_branches").select("branches(name)").eq("ptl_id", profile.id)
    : { data: null };

  const branchNames = (branches ?? []).map((b) => b.branches?.name).filter(Boolean).join(", ");

  return (
    <AppShell
      roleLabel="Purchase Team Lead"
      name={profile?.full_name ?? ""}
      subtitle={branchNames || undefined}
      links={[
        { href: "/ptl/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/ptl/cases", label: "All Cases", icon: "cases" },
      ]}
    >
      {children}
    </AppShell>
  );
}
