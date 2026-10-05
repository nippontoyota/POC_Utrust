// Isolated PostgreSQL tests for PO assignment, round-robin, lifecycle guards,
// and role-based access. Directly exercises the test plan scenarios.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
let checks = 0;
let failed = 0;
const results = [];

function check(condition, testId, message) {
  if (condition) {
    checks++;
    results.push({ id: testId, status: "PASS", message });
    console.log(`  ✅ ${testId}: ${message}`);
  } else {
    failed++;
    results.push({ id: testId, status: "FAIL", message });
    console.error(`  ❌ ${testId}: ${message}`);
  }
}

const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) =>
  Object.values((await query(sql, args)).rows[0])[0];
const fail = async (fn, pattern, testId, message) => {
  try {
    await fn();
    check(false, testId, `${message} — expected error but succeeded`);
  } catch (e) {
    check(pattern.test(e.message), testId, message);
  }
};

// ── Bootstrap schema ──
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated,anon;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean);
  create table storage.objects(id uuid,name text,bucket_id text);
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
  alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
`);
for (const file of (
  await readdir(new URL("../supabase/migrations/", import.meta.url))
)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const sql = (
    await readFile(
      new URL(`../supabase/migrations/${file}`, import.meta.url),
      "utf8",
    )
  ).replace('create extension if not exists "pgcrypto";', "");
  await db.exec(sql);
}
console.log("All migrations applied.\n");

// ── Setup: 2 branches, SOs, POs, Manager ──
const branches = (await query("select id,code from branches order by code limit 2")).rows;
const branchA = branches[0].id;
const branchB = branches[1].id;

const ids = {};
for (const key of [
  "so1", "so2", "po1", "po2", "po3", "po_inactive", "po_branchB",
  "manager", "groupManager", "broker1",
]) {
  ids[key] = randomUUID();
  await query("insert into auth.users values($1)", [ids[key]]);
}

// Profiles
for (const [key, role, branch, group, active] of [
  ["so1", "sales_officer", branchA, false, true],
  ["so2", "sales_officer", branchA, false, true],
  ["po1", "purchase_officer", branchA, false, true],
  ["po2", "purchase_officer", branchA, false, true],
  ["po3", "purchase_officer", branchA, false, true],
  ["po_inactive", "purchase_officer", branchA, false, false],
  ["po_branchB", "purchase_officer", branchB, false, true],
  ["manager", "manager", branchA, false, true],
  ["groupManager", "manager", branchA, true, true],
]) {
  await query(
    "insert into profiles(id,employee_id,full_name,role,branch_id,is_group_manager,is_active) values($1,$2,$2,$3,$4,$5,$6)",
    [ids[key], key, role, branch, group, active],
  );
}

// Broker
await query(
  "insert into brokers(id,company_name,contact_name,phone,email,status) values($1,'Test Broker','Contact','9999999999','broker@test.com','approved')",
  [ids.broker1],
);

const as = async (key, fn) => {
  await query("select set_config('request.jwt.claim.sub',$1,false)", [ids[key] ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); }
  finally { await db.exec("reset role"); }
};

const rpc = (name, args, casts) =>
  scalar(
    `select ${name}(${args.map((_, i) => `$${i + 1}${casts?.[i] ? `::${casts[i]}` : ""}`).join(",")})`,
    args,
  );

// Helper: create a complete draft case ready for submission
async function createDraftCase(soKey, regNum) {
  const caseId = randomUUID();
  await query(
    `insert into cases(id,branch_id,sales_officer_id,status,
      customer_name,customer_mobile,vehicle_reg_number,make,model,variant,
      registration_year,fuel_type,transmission,odometer_km,has_loan,customer_expected_price)
    values($1,$2,$3,'draft',
      'Test Customer','9000000001',$4,'Toyota','Innova','G',
      2022,'petrol','manual',30000,false,700000)`,
    [caseId, branchA, ids[soKey], regNum],
  );
  // Add 6 vehicle photos + RC
  for (const cat of ["front", "rear", "left", "right", "interior_odometer", "other"]) {
    await query(
      "insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)",
      [caseId, cat, `test/${cat}.jpg`],
    );
  }
  await query(
    "insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/rc.jpg',$2)",
    [caseId, ids[soKey]],
  );
  return caseId;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: PO ASSIGNMENT — ROUND-ROBIN (Manager's Question)
// ═══════════════════════════════════════════════════════════════
console.log("\n━━━ SECTION 1: PO Assignment & Round-Robin ━━━");

// Test 1.1 & 1.2: First two submissions go to different POs
const case1 = await createDraftCase("so1", "TEST-RR-001");
await as("so1", () => rpc("submit_case_for_evaluation", [case1]));
const c1 = (await query("select assigned_po_id from cases where id=$1", [case1])).rows[0];
const firstPO = c1.assigned_po_id;
check(
  [ids.po1, ids.po2, ids.po3].includes(firstPO),
  "1.1",
  `First case assigned to an active PO (got ${Object.entries(ids).find(([, v]) => v === firstPO)?.[0]})`
);

const case2 = await createDraftCase("so1", "TEST-RR-002");
await as("so1", () => rpc("submit_case_for_evaluation", [case2]));
const c2 = (await query("select assigned_po_id from cases where id=$1", [case2])).rows[0];
check(
  c2.assigned_po_id !== firstPO,
  "1.2",
  "Second case assigned to a DIFFERENT PO (round-robin works)"
);

// Test 1.3: Third case goes to the third PO
const case3 = await createDraftCase("so1", "TEST-RR-003");
await as("so1", () => rpc("submit_case_for_evaluation", [case3]));
const c3 = (await query("select assigned_po_id from cases where id=$1", [case3])).rows[0];
check(
  c3.assigned_po_id !== firstPO && c3.assigned_po_id !== c2.assigned_po_id,
  "1.3",
  "Third case assigned to the THIRD PO (3-way round-robin)"
);

// Test 1.4: Fourth case cycles back to the first PO
const case4 = await createDraftCase("so1", "TEST-RR-004");
await as("so1", () => rpc("submit_case_for_evaluation", [case4]));
const c4 = (await query("select assigned_po_id from cases where id=$1", [case4])).rows[0];
check(
  c4.assigned_po_id === firstPO,
  "1.4",
  "Fourth case cycles BACK to the first PO (round-robin wraps)"
);

// Test 1.7: Branch with no active POs
// Create a case in branchB where there is only 1 PO
const caseBranchB = await (async () => {
  const id = randomUUID();
  await query(
    `insert into cases(id,branch_id,sales_officer_id,status,
      customer_name,customer_mobile,vehicle_reg_number,make,model,variant,
      registration_year,fuel_type,transmission,odometer_km,has_loan,customer_expected_price)
    values($1,$2,$3,'draft',
      'Test','9000000000','TEST-NB-001','Toyota','Innova','G',
      2022,'petrol','manual',30000,false,700000)`,
    [id, branchB, ids.so2],
  );
  for (const cat of ["front", "rear", "left", "right", "interior_odometer", "other"]) {
    await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)", [id, cat, `test/${cat}.jpg`]);
  }
  await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/rc.jpg',$2)", [id, ids.so2]);
  return id;
})();
// so2 is in branchA. We need an SO in branchB for this to work. Let's test 0-PO scenario differently.
// Deactivate the only branchB PO and try
await query("update profiles set is_active=false where id=$1", [ids.po_branchB]);
// Create a proper SO in branchB for this test
const so_branchB = randomUUID();
await query("insert into auth.users values($1)", [so_branchB]);
await query("insert into profiles(id,employee_id,full_name,role,branch_id,is_group_manager) values($1,'soB','soB','sales_officer',$2,false)", [so_branchB, branchB]);
const caseNoPO = await (async () => {
  const id = randomUUID();
  await query(
    `insert into cases(id,branch_id,sales_officer_id,status,
      customer_name,customer_mobile,vehicle_reg_number,make,model,variant,
      registration_year,fuel_type,transmission,odometer_km,has_loan,customer_expected_price)
    values($1,$2,$3,'draft','Test','9000000000','TEST-NOPO-001','Toyota','Innova','G',2022,'petrol','manual',30000,false,700000)`,
    [id, branchB, so_branchB],
  );
  for (const cat of ["front", "rear", "left", "right", "interior_odometer", "other"]) {
    await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)", [id, cat, `test/${cat}.jpg`]);
  }
  await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/rc.jpg',$2)", [id, so_branchB]);
  return id;
})();
ids.so_branchB = so_branchB;
await fail(
  () => as("so_branchB", () => rpc("submit_case_for_evaluation", [caseNoPO])),
  /No active Purchase Officer/,
  "1.7",
  "0 active POs → error: 'No active Purchase Officer available'"
);
// Restore branchB PO
await query("update profiles set is_active=true where id=$1", [ids.po_branchB]);

// Test 1.8: Inactive PO is never assigned
check(
  ![c1.assigned_po_id, c2.assigned_po_id, c3.assigned_po_id, c4.assigned_po_id].includes(ids.po_inactive),
  "1.8",
  "Inactive PO was NEVER assigned across 4 round-robin cycles"
);

// Test 1.9: PO from different branch never assigned
check(
  ![c1.assigned_po_id, c2.assigned_po_id, c3.assigned_po_id, c4.assigned_po_id].includes(ids.po_branchB),
  "1.9",
  "PO from different branch was NEVER assigned"
);

// ═══════════════════════════════════════════════════════════════
// SECTION 2: CASE LIFECYCLE — STATUS TRANSITION CONFLICTS
// ═══════════════════════════════════════════════════════════════
console.log("\n━━━ SECTION 2: Case Lifecycle — Status Transitions ━━━");

// Test 2.1: Double submission
await fail(
  () => as("so1", () => rpc("submit_case_for_evaluation", [case1])),
  /not in draft/,
  "2.1",
  "Double submission → error: 'Case is not in draft status'"
);

// Test 2.2: Submit incomplete case
const incompleteCase = randomUUID();
await query(
  `insert into cases(id,branch_id,sales_officer_id,status,customer_name) values($1,$2,$3,'draft','Only Name')`,
  [incompleteCase, branchA, ids.so1],
);
for (const cat of ["front", "rear", "left", "right", "interior_odometer", "other"]) {
  await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)", [incompleteCase, cat, `test/${cat}.jpg`]);
}
await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/rc.jpg',$2)", [incompleteCase, ids.so1]);
await fail(
  () => as("so1", () => rpc("submit_case_for_evaluation", [incompleteCase])),
  /missing required fields/,
  "2.2",
  "Submit with missing fields → error: 'Case is missing required fields'"
);

// Test 2.3: Submit with < 6 photos
const noPhotoCase = randomUUID();
await query(
  `insert into cases(id,branch_id,sales_officer_id,status,
    customer_name,customer_mobile,vehicle_reg_number,make,model,variant,
    registration_year,fuel_type,transmission,odometer_km,has_loan,customer_expected_price)
  values($1,$2,$3,'draft','Test','9000000001','TEST-NOPHOTO','Toyota','Innova','G',2022,'petrol','manual',30000,false,700000)`,
  [noPhotoCase, branchA, ids.so1],
);
// Only add 3 photos
for (const cat of ["front", "rear", "left"]) {
  await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)", [noPhotoCase, cat, `test/${cat}.jpg`]);
}
await fail(
  () => as("so1", () => rpc("submit_case_for_evaluation", [noPhotoCase])),
  /photo/i,
  "2.3",
  "Submit with < 6 photos → error about photos"
);

// Test 2.4: Wrong PO evaluates
await as("po1", () => rpc("start_po_evaluation", [case1]));
const wrongPO = c1.assigned_po_id === ids.po1 ? "po2" : "po1";
await fail(
  () => as(wrongPO, () => rpc("submit_po_evaluation", [case1, true, "Test", 500000])),
  /Not authorized/,
  "2.4",
  "Wrong PO evaluates → error: 'Not authorized to evaluate this case'"
);

// Test 2.5: PO evaluates twice
const assignedPOKey = Object.entries(ids).find(([, v]) => v === c1.assigned_po_id)?.[0];
await as(assignedPOKey, () => rpc("start_po_evaluation", [case1]));
await as(assignedPOKey, () => rpc("submit_po_evaluation", [case1, true, "Inspected", 600000]));
await fail(
  () => as(assignedPOKey, () => rpc("submit_po_evaluation", [case1, true, "Again", 700000])),
  /not awaiting evaluation|unique/i,
  "2.5",
  "PO evaluates twice → error (UNIQUE constraint or status guard)"
);

// Test 2.6: PO evaluates without starting
const case5 = await createDraftCase("so1", "TEST-NOSTART");
await as("so1", () => rpc("submit_case_for_evaluation", [case5]));
const c5po = await scalar("select assigned_po_id from cases where id=$1", [case5]);
const c5poKey = Object.entries(ids).find(([, v]) => v === c5po)?.[0];
await fail(
  () => as(c5poKey, () => rpc("submit_po_evaluation", [case5, true, "Test", 500000])),
  /Start the evaluation/,
  "2.6",
  "PO evaluates without starting → error: 'Start the evaluation'"
);

// Test 2.7: SO withdraws after evaluation (pending_customer_decision)
check(
  await scalar("select status from cases where id=$1", [case1]) === "pending_customer_decision",
  "2.7a",
  "Case 1 is in pending_customer_decision"
);
await as("so1", () => rpc("withdraw_case", [case1, "Customer changed mind"]));
check(
  await scalar("select status from cases where id=$1", [case1]) === "withdrawn",
  "2.7",
  "SO withdraws from pending_customer_decision → status becomes 'withdrawn'"
);

// Test 2.8: Withdraw a terminal case
await fail(
  () => as("so1", () => rpc("withdraw_case", [case1, "Try again"])),
  /cannot be withdrawn/,
  "2.8",
  "Withdraw an already withdrawn case → error"
);

// Test 2.9: Duplicate vehicle reg number
// case1 is 'withdrawn' (terminal) so its reg is free. Use case2's reg instead
// (case2 is 'pending_evaluation' = active → unique index blocks even at INSERT).
await fail(
  async () => { await createDraftCase("so1", "TEST-RR-002"); },
  /unique|duplicate|uniq_open/i,
  "2.9",
  "Duplicate vehicle reg with active case → blocked at draft INSERT"
);

// Test 2.10: Customer decision on wrong status
const case6 = await createDraftCase("so1", "TEST-WRONGDECISION");
await as("so1", () => rpc("submit_case_for_evaluation", [case6]));
await fail(
  () => as("so1", () => rpc("record_customer_decision", [case6, "accepted"])),
  /not awaiting a customer decision/,
  "2.10",
  "Customer decision on pending_evaluation → error"
);

// Test 2.11: Counter offer after decision
const case7 = await createDraftCase("so1", "TEST-COUNTER-LATE");
await as("so1", () => rpc("submit_case_for_evaluation", [case7]));
const c7po = await scalar("select assigned_po_id from cases where id=$1", [case7]);
const c7poKey = Object.entries(ids).find(([, v]) => v === c7po)?.[0];
await as(c7poKey, () => rpc("start_po_evaluation", [case7]));
await as(c7poKey, () => rpc("submit_po_evaluation", [case7, true, "Inspected", 500000]));
await as("so1", () => rpc("record_customer_decision", [case7, "accepted"]));
await fail(
  () => as("so1", () => rpc("record_customer_counter_offer", [case7, 550000, "Want more"], ["uuid", "numeric", "text"])),
  /not awaiting a customer decision/,
  "2.11",
  "Counter offer after customer accepted → error"
);

// ═══════════════════════════════════════════════════════════════
// SECTION 3: ROLE-BASED ACCESS CONTROL (RLS)
// ═══════════════════════════════════════════════════════════════
console.log("\n━━━ SECTION 3: Role-Based Access Control ━━━");

// Test 3.1: SO sees only own cases
const so1Cases = (await as("so1", () => query("select id from cases"))).rows;
const so1Owns = await query("select id from cases where sales_officer_id=$1", [ids.so1]);
check(
  so1Cases.length === so1Owns.rows.length,
  "3.1",
  `SO1 sees only own cases (${so1Cases.length} = ${so1Owns.rows.length})`
);

// Test 3.2: PO sees only assigned cases
const po1Cases = (await as("po1", () => query("select id from cases"))).rows;
const po1Assigned = await query("select id from cases where assigned_po_id=$1", [ids.po1]);
check(
  po1Cases.length === po1Assigned.rows.length,
  "3.2",
  `PO1 sees only assigned cases (${po1Cases.length} = ${po1Assigned.rows.length})`
);

// Test 3.3: Branch Manager sees only branch cases
const mgrCases = (await as("manager", () => query("select id from cases"))).rows;
const branchACases = (await query("select id from cases where branch_id=$1", [branchA])).rows;
check(
  mgrCases.length === branchACases.length,
  "3.3",
  `Branch Manager sees only own branch cases (${mgrCases.length} = ${branchACases.length})`
);

// Test 3.4: Group Manager sees all cases
const gmCases = (await as("groupManager", () => query("select id from cases"))).rows;
const allCases = (await query("select id from cases")).rows;
check(
  gmCases.length === allCases.length,
  "3.4",
  `Group Manager sees ALL cases (${gmCases.length} = ${allCases.length})`
);

// Test 3.7: Broker sees 0 raw cases
const brokerCases = (await as("broker1", () => query("select id from cases"))).rows;
check(
  brokerCases.length === 0,
  "3.7",
  "Broker cannot read raw cases table (0 rows)"
);

// Test 3.8: Deactivated PO tries to evaluate
// Create a fresh case and deactivate the assigned PO before they try to start
const caseDeactPO = await createDraftCase("so1", "TEST-DEACT-PO");
await as("so1", () => rpc("submit_case_for_evaluation", [caseDeactPO]));
const deactPOId = await scalar("select assigned_po_id from cases where id=$1", [caseDeactPO]);
const deactPOKey = Object.entries(ids).find(([, v]) => v === deactPOId)?.[0];
await query("update profiles set is_active=false where id=$1", [deactPOId]);
await fail(
  () => as(deactPOKey, () => rpc("start_po_evaluation", [caseDeactPO])),
  /Assigned PO|not active|required/i,
  "3.8",
  "Deactivated PO cannot start evaluation"
);
await query("update profiles set is_active=true where id=$1", [deactPOId]);

// ═══════════════════════════════════════════════════════════════
// SECTION 5: DATA INTEGRITY — BOUNDARY CONDITIONS
// ═══════════════════════════════════════════════════════════════
console.log("\n━━━ SECTION 5: Data Integrity — Boundaries ━━━");

// Test 5.1: Offer price = 0
const case8 = await createDraftCase("so1", "TEST-PRICE-ZERO");
await as("so1", () => rpc("submit_case_for_evaluation", [case8]));
const c8po = await scalar("select assigned_po_id from cases where id=$1", [case8]);
const c8poKey = Object.entries(ids).find(([, v]) => v === c8po)?.[0];
await as(c8poKey, () => rpc("start_po_evaluation", [case8]));
await fail(
  () => as(c8poKey, () => rpc("submit_po_evaluation", [case8, true, "Test", 0])),
  /greater than zero/,
  "5.1",
  "Offer price = 0 → error: 'must be greater than zero'"
);

// Test 5.2: Negative offer price
await fail(
  () => as(c8poKey, () => rpc("submit_po_evaluation", [case8, true, "Test", -5000])),
  /greater than zero/,
  "5.2",
  "Negative offer price → error: 'must be greater than zero'"
);

// Test 5.7: Withdrawal without reason
const case9 = await createDraftCase("so1", "TEST-NO-REASON");
await as("so1", () => rpc("submit_case_for_evaluation", [case9]));
await fail(
  () => as("so1", () => rpc("withdraw_case", [case9, ""])),
  /reason is required/i,
  "5.7",
  "Withdrawal without reason → error: 'withdrawal reason is required'"
);

// Test 5.8: Cancellation without reason
const case10 = await createDraftCase("so1", "TEST-NO-CANCEL-REASON");
await as("so1", () => rpc("submit_case_for_evaluation", [case10]));
const c10po = await scalar("select assigned_po_id from cases where id=$1", [case10]);
const c10poKey = Object.entries(ids).find(([, v]) => v === c10po)?.[0];
await as(c10poKey, () => rpc("start_po_evaluation", [case10]));
await as(c10poKey, () => rpc("submit_po_evaluation", [case10, true, "Test", 500000]));
await as("so1", () => rpc("record_customer_decision", [case10, "accepted"]));
await fail(
  () => as("so1", () => rpc("cancel_case", [case10, ""])),
  /reason is required/i,
  "5.8",
  "Cancellation without reason → error: 'cancellation reason is required'"
);

// Test 5.9: Case ref uniqueness
const refs = (await query("select case_ref from cases where case_ref is not null")).rows.map(r => r.case_ref);
const uniqueRefs = new Set(refs);
check(
  refs.length === uniqueRefs.size,
  "5.9",
  `All ${refs.length} case_refs are unique`
);

// ═══════════════════════════════════════════════════════════════
// SECTION 6: CROSS-ROLE / CROSS-BRANCH CONFLICTS
// ═══════════════════════════════════════════════════════════════
console.log("\n━━━ SECTION 6: Cross-Role / Cross-Branch ━━━");

// Test 6.2: Branch Manager tries to manage broker
await fail(
  () => as("manager", () => rpc("manage_broker", [ids.broker1, "suspend", "Test"])),
  /group manager/,
  "6.2",
  "Branch Manager cannot manage brokers (not group manager)"
);

// Test 6.4: SO edits case after submission
const editAfterSubmit = (await as("so1", () =>
  query("update cases set customer_name='HACKED' where id=$1 returning id", [case6])
)).rows;
check(
  editAfterSubmit.length === 0,
  "6.4",
  "SO cannot edit case after submission (RLS blocks update, 0 rows affected)"
);

// Test 6.5: SO deletes submitted case
const deleteAfterSubmit = (await as("so1", () =>
  query("delete from cases where id=$1 returning id", [case6])
)).rows;
check(
  deleteAfterSubmit.length === 0,
  "6.5",
  "SO cannot delete submitted case (RLS blocks delete, 0 rows affected)"
);

// Test 6.6: PO tries to create a case
await fail(
  () => as("po1", () =>
    query("insert into cases(branch_id,sales_officer_id,status) values($1,$2,'draft')", [branchA, ids.po1])
  ),
  /violates|permission|row-level security/i,
  "6.6",
  "PO cannot create a case (RLS blocks insert)"
);

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(60));
console.log(`RESULTS: ${checks} passed, ${failed} failed out of ${checks + failed} total`);
if (failed > 0) {
  console.log("\nFAILED TESTS:");
  results.filter(r => r.status === "FAIL").forEach(r => console.log(`  ❌ ${r.id}: ${r.message}`));
  process.exitCode = 1;
} else {
  console.log("🎉 ALL TESTS PASSED — System behaviour matches the test plan.");
}
await db.close();
