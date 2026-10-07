import { getCurrentProfile } from "@/lib/supabase/auth";
import { AppShell } from "@/components/AppShell";

const ROLE_LABELS: Record<string, string> = {
  sales_manager: "Sales Manager",
  cluster_manager: "Cluster Manager",
  po_manager: "PO Manager",
};

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  const role = profile?.role ?? "sales_manager";
  const roleLabel = ROLE_LABELS[role] ?? role;
  const subtitle =
    role === "sales_manager"
      ? profile?.branches?.name
      : role === "cluster_manager"
        ? profile?.clusters?.name
        : "All branches";

  return (
    <AppShell
      roleLabel={roleLabel}
      name={profile?.full_name ?? ""}
      subtitle={subtitle}
      links={[
        { href: "/manager/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/manager/cases", label: "All Cases", icon: "cases" },
        ...(role === "cluster_manager"
          ? [
              {
                href: "/manager/marketplace",
                label: "Broker Performance",
                icon: "performance" as const,
              },
            ]
          : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
