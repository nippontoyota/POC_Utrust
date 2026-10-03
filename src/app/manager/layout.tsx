import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { RoleNav } from "@/components/RoleNav";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_group_manager, branches(name)")
    .eq("id", user!.id)
    .single();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppHeader
        roleLabel={profile?.is_group_manager ? "Manager (all branches)" : "Manager"}
        name={profile?.full_name ?? ""}
        subtitle={profile?.is_group_manager ? undefined : profile?.branches?.name}
      />
      <RoleNav
        links={[
          { href: "/manager/dashboard", label: "Dashboard" },
          { href: "/manager/cases", label: "All Cases" },
          { href: "/manager/marketplace", label: "Broker Performance" },
          ...(profile?.is_group_manager ? [{ href: "/manager/brokers", label: "Broker Access" }] : []),
        ]}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
