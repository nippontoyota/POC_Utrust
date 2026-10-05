import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccountForm } from "@/components/admin/AccountForm";

export default async function NewAccountPage() {
  const supabase = await createClient();
  const [{ data: branches }, { data: clusters }] = await Promise.all([
    supabase.from("branches").select("id, name").order("display_order"),
    supabase.from("clusters").select("id, name").order("display_order"),
  ]);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Users
      </Link>
      <PageHeader eyebrow="System administration" title="Create Account" description="Owner-provisioned staff account." />
      <AccountForm mode="create" branches={branches ?? []} clusters={clusters ?? []} />
    </div>
  );
}
