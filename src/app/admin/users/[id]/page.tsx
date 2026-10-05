import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccountForm } from "@/components/admin/AccountForm";
import { ActivateToggle } from "@/components/admin/ActivateToggle";
import { ResetPasswordForm } from "@/components/admin/ResetPasswordForm";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: target }, { data: branches }, { data: clusters }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("branches").select("id, name").order("display_order"),
    supabase.from("clusters").select("id, name").order("display_order"),
  ]);

  if (!target) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Users
      </Link>
      <PageHeader eyebrow="System administration" title={target.full_name} description={`Employee ID ${target.employee_id}`} />

      <AccountForm
        mode="edit"
        branches={branches ?? []}
        clusters={clusters ?? []}
        initial={{
          id: target.id,
          employeeId: target.employee_id,
          fullName: target.full_name,
          role: target.role,
          branchId: target.branch_id,
          clusterId: target.cluster_id,
        }}
      />

      <Card>
        <CardTitle>Account Status</CardTitle>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {target.is_active
            ? "This account can sign in and receive work normally."
            : "This account can't sign in. Past cases/offers stay attributed to them."}
        </p>
        <ActivateToggle profileId={target.id} isActive={target.is_active} isSelf={target.id === user!.id} />
      </Card>

      <Card>
        <CardTitle>Reset Password</CardTitle>
        <ResetPasswordForm userId={target.id} targetType="profile" />
      </Card>
    </div>
  );
}
