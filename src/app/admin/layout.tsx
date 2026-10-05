import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();

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
