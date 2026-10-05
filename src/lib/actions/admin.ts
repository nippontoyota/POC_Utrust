"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { employeeIdToAuthEmail } from "@/lib/employeeAuth";
import type { Enums } from "@/lib/supabase/database.types";

// Every privileged action here re-checks the caller is an active admin using
// their own normal session -- never trust a role claim from the client.
async function requireActiveAdminId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin" || !profile.is_active) return null;
  return user.id;
}

export async function adminCreateAccount(input: {
  employeeId: string;
  fullName: string;
  role: Enums<"app_role">;
  branchId?: string | null;
  clusterId?: string | null;
  isGroupManager?: boolean;
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
    is_group_manager: input.role === "manager" ? !!input.isGroupManager : false,
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
