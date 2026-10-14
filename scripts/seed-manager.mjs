// Site-owner tool: creates a Manager-family account directly. This is the only
// path that can ever produce one of these roles -- there is no in-app signup
// for any of them, by design (see the plan: managers are owner-provisioned only).
//
// Usage:
//   node scripts/seed-manager.mjs sales_manager <employeeId> <fullName> <branchCode> <password>
//   node scripts/seed-manager.mjs cluster_manager <employeeId> <fullName> <clusterName> <password>
//   node scripts/seed-manager.mjs po_manager <employeeId> <fullName> <password>
//   node scripts/seed-manager.mjs broker_coordinator <employeeId> <fullName> <password>
//   node scripts/seed-manager.mjs admin <employeeId> <fullName> <password>
//   node scripts/seed-manager.mjs ceo <employeeId> <fullName> <password>
//   node scripts/seed-manager.mjs ptl <employeeId> <fullName> <branchCode[,branchCode...]> <password>
//
// Examples:
//   node scripts/seed-manager.mjs sales_manager SM001 "Ravi Nair" CO01A salesmgr123
//   node scripts/seed-manager.mjs cluster_manager CM001 "Deepa Menon" Cochin clustermgr123
//   node scripts/seed-manager.mjs po_manager POM001 "Arjun Das" pomgr123
//   node scripts/seed-manager.mjs broker_coordinator BC001 "Philip Mathew" brokercoord123
//   node scripts/seed-manager.mjs admin ADM001 "Site Owner" adminpass123
//   node scripts/seed-manager.mjs ceo CEO001 "Owner Name" ceopass123
//   node scripts/seed-manager.mjs ptl PTL001 "Vipin M P" TI01A,TI01B,TI01C,IR01A ptlpass123

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROLES = ["sales_manager", "cluster_manager", "po_manager", "broker_coordinator", "admin", "ceo", "ptl"];
const NO_SCOPE_ROLES = ["po_manager", "broker_coordinator", "admin", "ceo"];

function loadEnvLocal() {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

function usageError(message) {
  console.error(message);
  console.error("Usage:");
  console.error("  node scripts/seed-manager.mjs sales_manager <employeeId> <fullName> <branchCode> <password>");
  console.error("  node scripts/seed-manager.mjs cluster_manager <employeeId> <fullName> <clusterName> <password>");
  console.error("  node scripts/seed-manager.mjs po_manager <employeeId> <fullName> <password>");
  console.error("  node scripts/seed-manager.mjs broker_coordinator <employeeId> <fullName> <password>");
  console.error("  node scripts/seed-manager.mjs admin <employeeId> <fullName> <password>");
  console.error("  node scripts/seed-manager.mjs ceo <employeeId> <fullName> <password>");
  console.error("  node scripts/seed-manager.mjs ptl <employeeId> <fullName> <branchCode[,branchCode...]> <password>");
  process.exit(1);
}

const [role, employeeId, fullName, ...rest] = process.argv.slice(2);

if (!ROLES.includes(role)) {
  usageError(`First argument must be one of: ${ROLES.join(", ")}`);
}
if (!employeeId || !fullName) {
  usageError("Missing employeeId or fullName.");
}

let scopeArg, password;
if (NO_SCOPE_ROLES.includes(role)) {
  [password] = rest;
} else {
  [scopeArg, password] = rest;
}

if (!password) {
  usageError("Missing password.");
}
if (!NO_SCOPE_ROLES.includes(role) && !scopeArg) {
  usageError(
    role === "cluster_manager"
      ? "Missing cluster name."
      : role === "ptl"
        ? "Missing branch code(s)."
        : "Missing branch code."
  );
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authEmail = `${employeeId.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}@staff.utrustpoc.com`;

const profileRow = {
  employee_id: employeeId.trim(),
  full_name: fullName.trim(),
  role,
  branch_id: null,
  cluster_id: null,
};

if (role === "sales_manager") {
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("code", scopeArg)
    .single();

  if (branchError || !branch) {
    console.error(`Branch code "${scopeArg}" not found:`, branchError?.message);
    process.exit(1);
  }
  profileRow.branch_id = branch.id;
} else if (role === "cluster_manager") {
  const { data: cluster, error: clusterError } = await supabase
    .from("clusters")
    .select("id")
    .ilike("name", scopeArg)
    .single();

  if (clusterError || !cluster) {
    console.error(`Cluster "${scopeArg}" not found:`, clusterError?.message);
    process.exit(1);
  }
  profileRow.cluster_id = cluster.id;
}

let ptlBranchIds = [];
if (role === "ptl") {
  const codes = [...new Set(scopeArg.split(",").map((c) => c.trim()).filter(Boolean))];
  const { data: ptlBranches, error: ptlBranchError } = await supabase
    .from("branches")
    .select("id, code")
    .in("code", codes);

  if (ptlBranchError) {
    console.error("Failed to look up branch codes:", ptlBranchError.message);
    process.exit(1);
  }

  const found = new Set((ptlBranches ?? []).map((b) => b.code));
  const missing = codes.filter((c) => !found.has(c));
  if (missing.length > 0) {
    console.error(`Branch code(s) not found: ${missing.join(", ")}`);
    process.exit(1);
  }

  ptlBranchIds = ptlBranches.map((b) => b.id);
}

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email: authEmail,
  password,
  email_confirm: true,
});

if (createError || !created.user) {
  console.error("Failed to create auth user:", createError?.message);
  process.exit(1);
}

const { error: profileError } = await supabase.from("profiles").insert({
  id: created.user.id,
  ...profileRow,
});

if (profileError) {
  console.error("Failed to create profile row:", profileError.message);
  process.exit(1);
}

if (role === "ptl" && ptlBranchIds.length > 0) {
  const { error: ptlBranchInsertError } = await supabase
    .from("ptl_branches")
    .insert(ptlBranchIds.map((branch_id) => ({ ptl_id: created.user.id, branch_id })));

  if (ptlBranchInsertError) {
    console.error("Failed to link PTL to branches:", ptlBranchInsertError.message);
    process.exit(1);
  }
}

console.log(`${role} account created: ${employeeId} / (password as given)${scopeArg ? `, scope: ${scopeArg}` : ""}`);
