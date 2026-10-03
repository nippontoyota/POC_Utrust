import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function ManagerLayout({
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
    .select("full_name, is_group_manager, branches(name)")
    .eq("id", user!.id)
    .single();

  return (
    <AppShell
      roleLabel={
        profile?.is_group_manager ? "Manager (all branches)" : "Manager"
      }
      name={profile?.full_name ?? ""}
      subtitle={profile?.is_group_manager ? undefined : profile?.branches?.name}
      links={[
        { href: "/manager/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/manager/cases", label: "All Cases", icon: "cases" },
        {
          href: "/manager/marketplace",
          label: "Broker Performance",
          icon: "performance",
        },
        ...(profile?.is_group_manager
          ? [
              {
                href: "/manager/brokers",
                label: "Broker Access",
                icon: "access" as const,
              },
            ]
          : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
