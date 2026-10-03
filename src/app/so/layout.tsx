import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { RoleNav } from "@/components/RoleNav";

export default async function SoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, branches(name)")
    .eq("id", user!.id)
    .single();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppHeader
        roleLabel="Sales Officer"
        name={profile?.full_name ?? ""}
        subtitle={profile?.branches?.name}
      />
      <RoleNav
        links={[
          { href: "/so/dashboard", label: "Dashboard" },
          { href: "/so/cases", label: "My Cases" },
        ]}
      />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
