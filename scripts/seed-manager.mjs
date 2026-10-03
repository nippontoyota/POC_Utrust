// Site-owner tool: creates a Manager account directly. This is the only path
// that can ever produce a Manager -- there is no in-app signup for it, by
// design (see the plan: Manager is owner-provisioned only).
//
// Usage:
//   node scripts/seed-manager.mjs <employeeId> <fullName> <branchCode> <password> [--group]
//
// Example:
//   node scripts/seed-manager.mjs MGR001 "Anu Manager" CO01A managerpass123 --group

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const env = loadEnvLocal();
const [employeeId, fullName, branchCode, password, groupFlag] = process.argv.slice(2);

if (!employeeId || !fullName || !branchCode || !password) {
  console.error("Usage: node scripts/seed-manager.mjs <employeeId> <fullName> <branchCode> <password> [--group]");
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authEmail = `${employeeId.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}@staff.utrustpoc.com`;

const { data: branch, error: branchError } = await supabase
  .from("branches")
  .select("id")
  .eq("code", branchCode)
  .single();

if (branchError || !branch) {
  console.error(`Branch code "${branchCode}" not found:`, branchError?.message);
  process.exit(1);
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
  employee_id: employeeId.trim(),
  full_name: fullName.trim(),
  role: "manager",
  branch_id: branch.id,
  is_group_manager: groupFlag === "--group",
});

if (profileError) {
  console.error("Failed to create profile row:", profileError.message);
  process.exit(1);
}

console.log(`Manager account created: ${employeeId} / (password as given), branch ${branchCode}, group manager: ${groupFlag === "--group"}`);
