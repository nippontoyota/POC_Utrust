import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { SignOutButton } from "@/components/SignOutButton";

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: broker } = await supabase
    .from("brokers")
    .select("company_name, status")
    .eq("id", user!.id)
    .single();

  if (!broker || broker.status !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {broker?.status === "rejected" ? "Application not approved" : "Application pending"}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {broker?.status === "rejected"
              ? "Your broker application was not approved. Contact UTrust for details."
              : "Your broker application is still awaiting approval. You'll get marketplace access once UTrust approves your account."}
          </p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppHeader roleLabel="Broker" name={broker.company_name} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
