import { getCurrentProfile } from "@/lib/supabase/auth";
import { AppShell } from "@/components/AppShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <AppShell
      roleLabel="Admin"
      name={profile?.full_name ?? ""}
      links={[
        { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/admin/users", label: "Users", icon: "access" },
        { href: "/admin/brokers", label: "Brokers", icon: "marketplace" },
      ]}
    >
      {children}
    </AppShell>
  );
}
