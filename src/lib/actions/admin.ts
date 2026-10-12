"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser, getCurrentProfile } from "@/lib/supabase/auth";
import { employeeIdToAuthEmail } from "@/lib/employeeAuth";
import type { Enums } from "@/lib/supabase/database.types";

// Every privileged action here re-checks the caller is an active admin using
// their own normal session -- never trust a role claim from the client.
async function requireActiveAdminId(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin" || !profile.is_active) return null;
  return user.id;
}

export async function adminCreateAccount(input: {
  employeeId: string;
  fullName: string;
  role: Enums<"app_role">;
  branchId?: string | null;
  clusterId?: string | null;
  password: string;
}): Promise<{ error?: string }> {
  const adminId = await requireActiveAdminId();
  if (!adminId) return { error: "Active admin required." };

  const employeeId = input.employeeId.trim();
  const fullName = input.fullName.trim();
  if (!employeeId || !fullName) return { error: "Employee ID and full name are required." };
  if (input.password.length < 8) return { error: "Password must be at least 8 characters." };

  const service = createServiceClient();
  const authEmail = employeeIdToAuthEmail(employeeId);

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: authEmail,
    password: input.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return {
      error: createError?.message.toLowerCase().includes("already registered")
        ? "That Employee ID is already registered."
        : (createError?.message ?? "Failed to create account."),
    };
  }

  const { error: profileError } = await service.from("profiles").insert({
    id: created.user.id,
    employee_id: employeeId,
    full_name: fullName,
    role: input.role,
    branch_id: input.branchId ?? null,
    cluster_id: input.clusterId ?? null,
  });

  if (profileError) {
    // Don't leave a login with no profile behind if this step fails.
    await service.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message };
  }

  await service.from("admin_events").insert({
    actor_id: adminId,
    action: "profile_created",
    target_type: "profile",
    target_id: created.user.id,
    metadata: { employee_id: employeeId, role: input.role },
  });

  return {};
}

export async function adminDeleteAccount(input: { userId: string }): Promise<{ error?: string }> {
  const adminId = await requireActiveAdminId();
  if (!adminId) return { error: "Active admin required." };
  if (input.userId === adminId) return { error: "You can't delete your own account." };

  const service = createServiceClient();

  const { data: target } = await service
    .from("profiles")
    .select("employee_id, full_name")
    .eq("id", input.userId)
    .maybeSingle();
  if (!target) return { error: "Account not found." };

  const [cases, offers, photos, negotiations, events] = await Promise.all([
    service.from("cases").select("id", { count: "exact", head: true }).or(`sales_officer_id.eq.${input.userId},assigned_po_id.eq.${input.userId}`),
    service.from("case_offers").select("id", { count: "exact", head: true }).eq("purchase_officer_id", input.userId),
    service.from("case_photos").select("id", { count: "exact", head: true }).eq("uploaded_by", input.userId),
    service.from("case_negotiations").select("id", { count: "exact", head: true }).eq("recorded_by", input.userId),
    service.from("case_events").select("id", { count: "exact", head: true }).eq("actor_id", input.userId),
  ]);

  const hasHistory = [cases, offers, photos, negotiations, events].some((r) => (r.count ?? 0) > 0);
  if (hasHistory) {
    return { error: "This account has case history and can't be deleted. Deactivate it instead." };
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(input.userId);
  if (deleteError) return { error: deleteError.message };

  await service.from("admin_events").insert({
    actor_id: adminId,
    action: "profile_deleted",
    target_type: "profile",
    target_id: input.userId,
    metadata: { employee_id: target.employee_id, full_name: target.full_name },
  });

  return {};
}

export async function adminResetPassword(input: {
  userId: string;
  newPassword: string;
  targetType: "profile" | "broker";
}): Promise<{ error?: string }> {
  const adminId = await requireActiveAdminId();
  if (!adminId) return { error: "Active admin required." };
  if (input.newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(input.userId, {
    password: input.newPassword,
  });
  if (error) return { error: error.message };

  await service.from("admin_events").insert({
    actor_id: adminId,
    action: "password_reset",
    target_type: input.targetType,
    target_id: input.userId,
    metadata: {},
  });

  return {};
}
