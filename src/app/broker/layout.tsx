import { getCurrentBroker } from "@/lib/supabase/auth";
import { AppShell } from "@/components/AppShell";
import { SignOutButton } from "@/components/SignOutButton";

export default async function BrokerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const broker = await getCurrentBroker();

  if (!broker || broker.status !== "approved" || broker.suspended_at) {
    return (
      <div className="nt-shell flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-6 text-center shadow-[0_24px_70px_rgb(33_25_20/0.1)]">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {broker?.suspended_at
              ? "Account suspended"
              : broker?.status === "rejected"
                ? "Application not approved"
                : "Application pending"}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {broker?.suspended_at
              ? "Contact UTrust about your marketplace access."
              : broker?.status === "rejected"
                ? "Your broker application was not approved. Contact UTrust for details."
                : "Your broker application is still awaiting approval. You'll get marketplace access once UTrust approves your account."}
          </p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  return (
    <AppShell
      roleLabel="Broker"
      name={broker.company_name}
      subtitle={broker.broker_ref}
      links={[
        {
          href: "/broker/dashboard",
          label: "Marketplace",
          icon: "marketplace",
        },
        { href: "/broker/offers", label: "My Offers", icon: "offers" },
        {
          href: "/broker/reservations",
          label: "Reservations",
          icon: "reservations",
        },
        { href: "/broker/history", label: "Deal History", icon: "history" },
      ]}
    >
      {children}
    </AppShell>
  );
}
