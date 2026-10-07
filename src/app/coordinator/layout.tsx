import { getCurrentProfile } from "@/lib/supabase/auth";
import { AppShell } from "@/components/AppShell";

export default async function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

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
