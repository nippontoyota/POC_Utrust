import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function PoLayout({
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
    .select("full_name, branches(name)")
    .eq("id", user!.id)
    .single();

  return (
    <AppShell
      roleLabel="Purchase Officer"
      name={profile?.full_name ?? ""}
      subtitle={profile?.branches?.name}
      links={[
        { href: "/po/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/po/cases", label: "Assigned Cases", icon: "cases" },
      ]}
    >
      {children}
    </AppShell>
  );
}
