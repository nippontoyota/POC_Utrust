import { getCurrentProfile } from "@/lib/supabase/auth";
import { AppShell } from "@/components/AppShell";

export default async function PoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <AppShell
      roleLabel="Procurement Officer"
      name={profile?.full_name ?? ""}
      subtitle={profile?.branches?.name}
      links={[
        { href: "/po/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/po/cases", label: "My Cases", icon: "cases" },
      ]}
    >
      {children}
    </AppShell>
  );
}
