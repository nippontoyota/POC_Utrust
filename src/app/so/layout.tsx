import { getCurrentProfile } from "@/lib/supabase/auth";
import { AppShell } from "@/components/AppShell";

export default async function SoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <AppShell
      roleLabel="Sales Officer"
      name={profile?.full_name ?? ""}
      subtitle={profile?.branches?.name}
      links={[
        { href: "/so/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/so/cases", label: "My Cases", icon: "cases" },
      ]}
    >
      {children}
    </AppShell>
  );
}
