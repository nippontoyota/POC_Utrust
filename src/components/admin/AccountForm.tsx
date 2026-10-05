"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { adminCreateAccount } from "@/lib/actions/admin";
import { ActionFeedback, useAdminAction } from "./useAdminAction";
import type { Enums } from "@/lib/supabase/database.types";

type Branch = { id: string; name: string };
type Cluster = { id: string; name: string };

const ROLE_OPTIONS: { value: Enums<"app_role">; label: string }[] = [
  { value: "sales_officer", label: "Sales Officer" },
  { value: "purchase_officer", label: "Purchase Officer" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "cluster_manager", label: "Cluster Manager" },
  { value: "po_manager", label: "PO Manager" },
  { value: "admin", label: "Admin" },
];

const BRANCH_ROLES = new Set(["sales_officer", "purchase_officer", "sales_manager"]);

export function AccountForm({
  mode,
  branches,
  clusters,
  initial,
}: {
  mode: "create" | "edit";
  branches: Branch[];
  clusters: Cluster[];
  initial?: {
    id: string;
    employeeId: string;
    fullName: string;
    role: Enums<"app_role">;
    branchId: string | null;
    clusterId: string | null;
  };
}) {
  const router = useRouter();
  const { busy, error, success, runRpc, runServerAction } = useAdminAction();

  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [role, setRole] = useState<Enums<"app_role">>(initial?.role ?? "sales_officer");
  const [branchId, setBranchId] = useState(initial?.branchId ?? branches[0]?.id ?? "");
  const [clusterId, setClusterId] = useState(initial?.clusterId ?? clusters[0]?.id ?? "");
  const [password, setPassword] = useState("");

  const needsBranch = BRANCH_ROLES.has(role);
  const needsCluster = role === "cluster_manager";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "create") {
      const ok = await runServerAction(adminCreateAccount, {
        employeeId,
        fullName,
        role,
        branchId: needsBranch ? branchId : null,
        clusterId: needsCluster ? clusterId : null,
        password,
      });
      if (ok) router.push("/admin/users");
    } else if (initial) {
      await runRpc("admin_reassign_profile", {
        p_profile_id: initial.id,
        p_role: role,
        p_branch_id: needsBranch ? branchId : null,
        p_cluster_id: needsCluster ? clusterId : null,
        p_full_name: fullName,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_18px_55px_rgb(33_25_20/0.06)]">
      <FormField label="Employee ID" required>
        <input
          type="text"
          value={employeeId}
          disabled={mode === "edit"}
          onChange={(e) => setEmployeeId(e.target.value)}
          required
          className={inputClass}
        />
      </FormField>
      {mode === "edit" && (
        <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">Employee ID can&apos;t be changed after creation.</p>
      )}

      <FormField label="Full name" required>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className={inputClass} />
      </FormField>

      <FormField label="Role" required>
        <select value={role} onChange={(e) => setRole(e.target.value as Enums<"app_role">)} className={inputClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>

      {needsBranch && (
        <FormField label="Branch" required>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {needsCluster && (
        <FormField label="Cluster" required>
          <select value={clusterId} onChange={(e) => setClusterId(e.target.value)} className={inputClass}>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {mode === "create" && (
        <FormField label="Password" required>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
        </FormField>
      )}

      <ActionFeedback error={error} success={success} />

      <Button type="submit" disabled={busy}>
        {busy ? "Saving..." : mode === "create" ? "Create Account" : "Save Changes"}
      </Button>
    </form>
  );
}
