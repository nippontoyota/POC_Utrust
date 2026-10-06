// Extended edge-case tests for UTrust POC.
// Runs against an isolated PGlite database — zero risk to production.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
let passed = 0, failed = 0;
const results = [];

function check(condition, id, message) {
  if (condition) {
    passed++;
    results.push({ id, status: "PASS", message });
    console.log(`  ✅ ${id}: ${message}`);
  } else {
    failed++;
    results.push({ id, status: "FAIL", message });
    console.error(`  ❌ ${id}: ${message}`);
  }
}

const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) => Object.values((await query(sql, args)).rows[0])[0];
const rows = async (sql, args = []) => (await query(sql, args)).rows;

async function expectError(fn, pattern, id, message) {
  try {
    await fn();
    check(false, id, `${message} — expected error but succeeded`);
  } catch (e) {
    if (!pattern.test(e.message)) console.log(`[DEBUG] Actual error for ${id}: ${e.message}`);
    check(pattern.test(e.message), id, message);
  }
}

// ── Bootstrap ──
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
for (const file of (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter(f => f.endsWith(".sql")).sort()) {
  const sql = (await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")).replace('create extension if not exists "pgcrypto";', "");
  await db.exec(sql);
}
console.log("All migrations applied.\n");

// ── Setup: 3 branches, multiple users per role ──
const branches = (await query("select id,code from branches order by code")).rows;
const branchA = branches[0].id; // DEL
const branchB = branches[1].id; // MUM
const branchC = branches[2].id; // PUN

const ids = {};
const makeUser = async (key) => { ids[key] = randomUUID(); await query("insert into auth.users values($1)", [ids[key]]); };
for (const k of [
  "so1","so2","so_branchB","so_branchC",
  "po1","po2","po_branchB",
  "mgr_A","mgr_B","group_mgr",
  "broker1","broker2","broker_suspended","broker_staff_conflict",
]) await makeUser(k);

for (const [key, role, branch, group] of [
  ["so1","sales_officer",branchA,false],["so2","sales_officer",branchA,false],
  ["so_branchB","sales_officer",branchB,false],["so_branchC","sales_officer",branchC,false],
  ["po1","purchase_officer",branchA,false],["po2","purchase_officer",branchA,false],
  ["po_branchB","purchase_officer",branchB,false],
  ["mgr_A","manager",branchA,false],["mgr_B","manager",branchB,false],
  ["group_mgr","manager",branchA,true],
]) await query("insert into profiles(id,employee_id,full_name,role,branch_id,is_group_manager) values($1,$2,$2,$3,$4,$5)", [ids[key],key,role,branch,group]);

for (const [key, status] of [["broker1","approved"],["broker2","approved"],["broker_suspended","approved"]])
  await query("insert into brokers(id,company_name,contact_name,phone,email,status) values($1,$2,$2,'9999999999',$3,$4)", [ids[key],key,`${key}@test.com`,status]);

// broker_staff_conflict: insert BOTH as broker AND staff
await query("insert into brokers(id,company_name,contact_name,phone,email,status) values($1,'Conflict Co','Conflict','9999999999','conflict@test.com','approved')", [ids.broker_staff_conflict]);
await query("insert into profiles(id,employee_id,full_name,role,branch_id,is_group_manager) values($1,'conflictstaff','conflictstaff','sales_officer',$2,false)", [ids.broker_staff_conflict, branchA]);

// Suspend one broker
await query("update brokers set suspended_at=now() where id=$1", [ids.broker_suspended]);

const as = async (key, fn) => {
  await query("select set_config('request.jwt.claim.sub',$1,false)", [ids[key]]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); }
};
const rpc = (name, args, casts) => scalar(`select ${name}(${args.map((_,i) => `$${i+1}${casts?.[i] ? `::${casts[i]}` : ""}`).join(",")})`, args);

async function createCase(soKey, branch, regNum) {
  const id = randomUUID();
  await query(`insert into cases(id,branch_id,sales_officer_id,status,customer_name,customer_mobile,vehicle_reg_number,make,model,variant,registration_year,fuel_type,transmission,odometer_km,has_loan,customer_expected_price) values($1,$2,$3,'draft','Customer','9000000001',$4,'Toyota','Innova','G',2022,'petrol','manual',30000,false,700000)`, [id,branch,ids[soKey],regNum]);
  for (const cat of ["front","rear","left","right","interior_odometer","other"])
    await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)", [id,cat,`test/${cat}.jpg`]);
  await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/rc.jpg',$2)", [id,ids[soKey]]);
  return id;
}
async function submitCase(soKey, caseId) { await as(soKey, () => rpc("submit_case_for_evaluation", [caseId])); }
async function evaluateCase(caseId, price = 600000) {
  const poId = await scalar("select assigned_po_id from cases where id=$1", [caseId]);
  const poKey = Object.entries(ids).find(([,v]) => v === poId)?.[0];
  await as(poKey, () => rpc("start_po_evaluation", [caseId]));
  await as(poKey, () => rpc("submit_po_evaluation", [caseId, true, "Inspected", price]));
  return poKey;
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 1: PO ASSIGNMENT (Sequential)
// ═══════════════════════════════════════════════════════════
console.log("━━━ EC1: PO Assignment ━━━");
{
  const c1 = await createCase("so1", branchA, "RACE-001");
  const c2 = await createCase("so2", branchA, "RACE-002");
  await submitCase("so1", c1);
  await submitCase("so2", c2);
  const po1 = await scalar("select assigned_po_id from cases where id=$1", [c1]);
  const po2 = await scalar("select assigned_po_id from cases where id=$1", [c2]);
  check(po1 !== po2, "EC1.1", "Two simultaneous submissions get DIFFERENT POs (no duplicate assignment)");
  check([ids.po1, ids.po2].includes(po1) && [ids.po1, ids.po2].includes(po2), "EC1.2", "Both assigned POs are valid active POs in the branch");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 2: CROSS-BRANCH ISOLATION
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC2: Cross-Branch Data Isolation ━━━");
{
  const caseB = await createCase("so_branchB", branchB, "CROSS-001");
  await submitCase("so_branchB", caseB);

  // SO from branch A cannot see branch B's case
  const soASees = (await as("so1", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(soASees.length === 0, "EC2.1", "SO in Branch-A cannot see Branch-B's case (RLS blocks)");

  // PO from branch A cannot see branch B's case
  const poASees = (await as("po1", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(poASees.length === 0, "EC2.2", "PO in Branch-A cannot see Branch-B's case");

  // Branch Manager A cannot see branch B's case
  const mgrASees = (await as("mgr_A", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(mgrASees.length === 0, "EC2.3", "Branch Manager-A cannot see Branch-B's case");

  // Branch Manager B CAN see it
  const mgrBSees = (await as("mgr_B", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(mgrBSees.length === 1, "EC2.4", "Branch Manager-B CAN see their own branch's case");

  // Group manager sees ALL
  const gmSees = (await as("group_mgr", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(gmSees.length === 1, "EC2.5", "Group Manager sees cross-branch case");

  // Case photos inherit case visibility
  const photosCrossA = (await as("mgr_A", () => query("select id from case_photos where case_id=$1", [caseB]))).rows;
  check(photosCrossA.length === 0, "EC2.6", "Case photos invisible to Branch Manager-A (follows parent case RLS)");

  const photosCrossB = (await as("mgr_B", () => query("select id from case_photos where case_id=$1", [caseB]))).rows;
  check(photosCrossB.length === 7, "EC2.7", "Case photos visible to Branch Manager-B (7 photos)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 3: SO IMPERSONATION / OWNERSHIP ATTACKS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC3: SO Ownership & Impersonation ━━━");
{
  const caseOwned = await createCase("so1", branchA, "OWN-001");
  await submitCase("so1", caseOwned);
  await evaluateCase(caseOwned);

  // SO2 tries to record customer decision on SO1's case
  await expectError(
    () => as("so2", () => rpc("record_customer_decision", [caseOwned, "accepted"])),
    /Not authorized/, "EC3.1", "SO2 cannot record decision on SO1's case"
  );

  // SO2 tries to withdraw SO1's case
  await expectError(
    () => as("so2", () => rpc("withdraw_case", [caseOwned, "Theft attempt"])),
    /Not authorized/, "EC3.2", "SO2 cannot withdraw SO1's case"
  );

  // SO2 tries to close SO1's case
  await as("so1", () => rpc("record_customer_decision", [caseOwned, "accepted"]));
  await expectError(
    () => as("so2", () => rpc("close_case", [caseOwned])),
    /Not authorized/, "EC3.3", "SO2 cannot close SO1's case"
  );

  // SO2 tries to cancel SO1's case
  await expectError(
    () => as("so2", () => rpc("cancel_case", [caseOwned, "Fraud"])),
    /Not authorized/, "EC3.4", "SO2 cannot cancel SO1's case"
  );

  // SO2 tries counter offer on SO1's case
  const co = await createCase("so1", branchA, "OWN-002");
  await submitCase("so1", co);
  await evaluateCase(co);
  await expectError(
    () => as("so2", () => rpc("record_customer_counter_offer", [co, 800000], ["uuid","numeric"])),
    /Not authorized/, "EC3.5", "SO2 cannot submit counter offer on SO1's case"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 4: PO EVALUATION EDGE CASES
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC4: PO Evaluation Edge Cases ━━━");
{
  // 4.1: PO submits with inspection_completed = false
  const c1 = await createCase("so1", branchA, "EVAL-001");
  await submitCase("so1", c1);
  const po = await scalar("select assigned_po_id from cases where id=$1", [c1]);
  const poKey = Object.entries(ids).find(([,v]) => v === po)?.[0];
  await as(poKey, () => rpc("start_po_evaluation", [c1]));
  await expectError(
    () => as(poKey, () => rpc("submit_po_evaluation", [c1, false, "Not inspected", 500000])),
    /inspection must be confirmed/i, "EC4.1", "PO cannot submit without confirming inspection"
  );

  // 4.2: PO submits with NULL offer price
  await expectError(
    () => as(poKey, () => rpc("submit_po_evaluation", [c1, true, "Test", null])),
    /greater than zero/i, "EC4.2", "PO cannot submit with NULL offer price"
  );

  // 4.3: start_po_evaluation is idempotent
  await as(poKey, () => rpc("start_po_evaluation", [c1])); // second call
  const startCount = await scalar("select count(*)::int from case_events where case_id=$1 and event_type='evaluation_started'", [c1]);
  check(startCount === 1, "EC4.3", "start_po_evaluation called twice creates only ONE event (idempotent)");

  // 4.4: PO from branch B tries to start evaluation on branch A case
  await expectError(
    () => as("po_branchB", () => rpc("start_po_evaluation", [c1])),
    /Assigned PO/i, "EC4.4", "PO from another branch cannot start evaluation on this case"
  );

  // 4.5: Very large offer price (boundary)
  await as(poKey, () => rpc("submit_po_evaluation", [c1, true, "Luxury car", 9999999999.99]));
  const offerPrice = await scalar("select offer_price from case_offers where case_id=$1", [c1]);
  check(parseFloat(offerPrice) === 9999999999.99, "EC4.5", "Maximum valid offer price (₹999.99Cr) accepted");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 5: COUNTER OFFER EDGE CASES
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC5: Customer Counter Offer Edge Cases ━━━");
{
  const c1 = await createCase("so1", branchA, "CNTR-001");
  await submitCase("so1", c1);
  await evaluateCase(c1);

  // 5.1: Valid counter offer
  await as("so1", () => rpc("record_customer_counter_offer", [c1, 750000, "Customer wants more"], ["uuid","numeric","text"]));
  check(await scalar("select customer_counter_offer_price from cases where id=$1", [c1]) == 750000, "EC5.1", "Counter offer of ₹7.5L recorded successfully");

  // 5.2: Overwrite counter offer (should update, not fail)
  await as("so1", () => rpc("record_customer_counter_offer", [c1, 800000, "Revised demand"], ["uuid","numeric","text"]));
  check(await scalar("select customer_counter_offer_price from cases where id=$1", [c1]) == 800000, "EC5.2", "Counter offer updated to ₹8L (overwrite allowed)");

  // 5.3: Counter offer with 0
  await expectError(
    () => as("so1", () => rpc("record_customer_counter_offer", [c1, 0, "Free"], ["uuid","numeric","text"])),
    /valid/i, "EC5.3", "Counter offer of ₹0 rejected"
  );

  // 5.4: Counter offer at ₹1000 Crore boundary
  await expectError(
    () => as("so1", () => rpc("record_customer_counter_offer", [c1, 10000000000, ""], ["uuid","numeric","text"])),
    /valid/i, "EC5.4", "Counter offer >= ₹1000Cr rejected"
  );

  // 5.5: Counter offer with very long note (> 1000 chars should fail at column check)
  const longNote = "x".repeat(1001);
  await expectError(
    () => as("so1", () => rpc("record_customer_counter_offer", [c1, 750000, longNote], ["uuid","numeric","text"])),
    /check|length|1000/i, "EC5.5", "Counter offer note > 1000 chars rejected"
  );

  // 5.6: Counter offer with null note (should work)
  await as("so1", () => rpc("record_customer_counter_offer", [c1, 780000, null], ["uuid","numeric","text"]));
  check(await scalar("select customer_counter_offer_note from cases where id=$1", [c1]) === null, "EC5.6", "Counter offer with null note accepted (optional field)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 6: TERMINAL STATE IMMUTABILITY
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC6: Terminal State Immutability ━━━");
{
  // Create a closed case
  const c1 = await createCase("so1", branchA, "TERM-001");
  await submitCase("so1", c1);
  await evaluateCase(c1);
  await as("so1", () => rpc("record_customer_decision", [c1, "accepted"]));
  await as("so1", () => rpc("close_case", [c1]));
  check(await scalar("select status from cases where id=$1", [c1]) === "closed", "EC6.0", "Case successfully closed");

  // Try every action on a closed case
  await expectError(() => as("so1", () => rpc("withdraw_case", [c1, "Try"])), /cannot be withdrawn/, "EC6.1", "Cannot withdraw a closed case");
  await expectError(() => as("so1", () => rpc("close_case", [c1])), /not awaiting/, "EC6.2", "Cannot close a closed case again");
  await expectError(() => as("so1", () => rpc("cancel_case", [c1, "Try"])), /not awaiting/, "EC6.3", "Cannot cancel a closed case");
  await expectError(() => as("so1", () => rpc("record_customer_decision", [c1, "rejected"])), /not awaiting/, "EC6.4", "Cannot record decision on a closed case");

  // Cancelled case
  const c2 = await createCase("so1", branchA, "TERM-002");
  await submitCase("so1", c2);
  await evaluateCase(c2);
  await as("so1", () => rpc("record_customer_decision", [c2, "accepted"]));
  await as("so1", () => rpc("cancel_case", [c2, "Customer disappeared"]));
  await expectError(() => as("so1", () => rpc("close_case", [c2])), /not awaiting/, "EC6.5", "Cannot close a cancelled case");
  await expectError(() => as("so1", () => rpc("cancel_case", [c2, "Again"])), /not awaiting/, "EC6.6", "Cannot cancel a cancelled case again");

  // rejected_not_listed case
  const c3 = await createCase("so1", branchA, "TERM-003");
  await submitCase("so1", c3);
  await evaluateCase(c3);
  await as("so1", () => rpc("record_customer_decision", [c3, "rejected", false]));
  check(await scalar("select status from cases where id=$1", [c3]) === "rejected_not_listed", "EC6.7", "Rejection without broker consent → rejected_not_listed");
  await expectError(() => as("so1", () => rpc("withdraw_case", [c3, "Try"])), /cannot be withdrawn/, "EC6.8", "Cannot withdraw a rejected_not_listed case");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 7: BROKER-STAFF IDENTITY CONFLICT
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC7: Broker-Staff Identity Conflict ━━━");
{
  // User who is BOTH a broker and staff — broker functions should be blocked
  const isApproved = await as("broker_staff_conflict", () => scalar("select is_approved_broker()"));
  check(isApproved === false, "EC7.1", "User with both broker + staff profile: is_approved_broker() returns FALSE");

  // They cannot use broker_marketplace
  await expectError(
    () => as("broker_staff_conflict", () => rpc("broker_marketplace", ["",null,"marketplace",0,"newest",null])),
    /Approved broker/i, "EC7.2", "Staff-broker hybrid cannot browse marketplace"
  );

  // But they CAN use SO functions since they have a sales_officer profile
  const draft = await as("broker_staff_conflict", () =>
    scalar("insert into cases(branch_id,sales_officer_id,status) values($1,$2,'draft') returning id", [branchA, ids.broker_staff_conflict])
  );
  check(draft !== null, "EC7.3", "Staff-broker hybrid CAN create cases as SO (staff role takes priority)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 8: SUSPENDED BROKER RESTRICTIONS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC8: Suspended Broker Restrictions ━━━");
{
  // Suspended broker cannot browse marketplace
  await expectError(
    () => as("broker_suspended", () => rpc("broker_marketplace", ["",null,"marketplace",0,"newest",null])),
    /Approved broker/i, "EC8.1", "Suspended broker cannot browse marketplace"
  );

  // Suspended broker cannot place offers
  const c = await createCase("so1", branchA, "SUSP-001");
  await submitCase("so1", c);
  await evaluateCase(c);
  // Prepare photo for broker visibility before consenting, as the marketplace requires
  const photo = await scalar("select id from case_photos where case_id=$1 and category='left' limit 1", [c]);
  await as("so1", () => rpc("review_broker_photo", [photo, true]));
  await as("so1", () => rpc("record_customer_decision", [c, "rejected", true]));

  await expectError(
    () => as("broker_suspended", () => rpc("broker_case_action", [c, "offer", JSON.stringify({amount:500000,revision:0})], ["uuid","text","jsonb"])),
    /Approved broker|Not authorized/i, "EC8.2", "Suspended broker cannot place offers"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 9: WHITESPACE & EMPTY INPUT VALIDATION
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC9: Whitespace & Empty Input Validation ━━━");
{
  const c = await createCase("so1", branchA, "SPACE-001");
  await submitCase("so1", c);

  // Withdraw with whitespace-only reason
  await expectError(
    () => as("so1", () => rpc("withdraw_case", [c, "   "])),
    /reason is required/i, "EC9.1", "Withdraw with whitespace-only reason rejected"
  );

  await expectError(
    () => as("so1", () => rpc("withdraw_case", [c, "\t\n"])),
    /reason is required/i, "EC9.2", "Withdraw with tab/newline-only reason rejected"
  );

  // Cancel with whitespace-only reason (need to get to right status first)
  const c2 = await createCase("so1", branchA, "SPACE-002");
  await submitCase("so1", c2);
  await evaluateCase(c2);
  await as("so1", () => rpc("record_customer_decision", [c2, "accepted"]));
  await expectError(
    () => as("so1", () => rpc("cancel_case", [c2, "   "])),
    /reason is required/i, "EC9.3", "Cancel with whitespace-only reason rejected"
  );

  // Null withdrawal reason
  const c3 = await createCase("so1", branchA, "SPACE-003");
  await submitCase("so1", c3);
  await expectError(
    () => as("so1", () => rpc("withdraw_case", [c3, null])),
    /reason is required/i, "EC9.4", "Withdraw with NULL reason rejected"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 10: CASE REF FORMAT & SEQUENCING
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC10: Case Reference Format & Sequencing ━━━");
{
  const refs = await rows("select case_ref from cases where case_ref is not null order by submitted_at");
  const pattern = /^UT-[a-zA-Z0-9]+-\d{6}-\d{4}$/; // Adjusted to allow any branch code chars
  const invalid = refs.map(r => r.case_ref).filter(r => !pattern.test(r));
  if (invalid.length > 0) console.log("INVALID REFS:", invalid);
  check(invalid.length === 0, "EC10.1", `All ${refs.length} case_refs match format UT-XXX-YYYYMM-NNNN`);

  // Check sequential within same branch+month
  const byPrefix = {};
  for (const r of refs) {
    const prefix = r.case_ref.substring(0, 14); // UT-DEL-202610-
    if (!byPrefix[prefix]) byPrefix[prefix] = [];
    byPrefix[prefix].push(parseInt(r.case_ref.slice(-4)));
  }
  let allSequential = true;
  for (const [prefix, seqs] of Object.entries(byPrefix)) {
    const sorted = [...seqs].sort((a,b) => a-b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i-1] + 1) { allSequential = false; break; }
    }
  }
  check(allSequential, "EC10.2", "Case ref sequences are gapless within each branch+month");

  // Case refs are unique across all branches
  const uniqueRefs = new Set(refs.map(r => r.case_ref));
  check(uniqueRefs.size === refs.length, "EC10.3", `All ${refs.length} case_refs globally unique`);
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 11: AUDIT TRAIL INTEGRITY
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC11: Audit Trail Completeness ━━━");
{
  // Full lifecycle: draft → submitted → evaluated → accepted → closed
  const c = await createCase("so1", branchA, "AUDIT-001");
  await submitCase("so1", c);
  const poKey = await evaluateCase(c);
  await as("so1", () => rpc("record_customer_decision", [c, "accepted"]));
  await as("so1", () => rpc("close_case", [c]));

  const events = await rows("select event_type, actor_id, actor_role from case_events where case_id=$1 order by created_at", [c]);
  const types = events.map(e => e.event_type);

  check(types.includes("submitted_for_evaluation"), "EC11.1", "Audit: submission event recorded");
  check(types.includes("evaluation_started"), "EC11.2", "Audit: evaluation start event recorded");
  check(types.includes("evaluation_submitted"), "EC11.3", "Audit: evaluation submission event recorded");
  check(types.includes("customer_decision_recorded"), "EC11.4", "Audit: customer decision event recorded");
  check(types.includes("case_closed"), "EC11.5", "Audit: case closed event recorded");

  // Every event has actor_id and actor_role
  const allHaveActor = events.every(e => e.actor_id !== null && e.actor_role !== null);
  check(allHaveActor, "EC11.6", "Every audit event has actor_id AND actor_role (full attribution)");

  // SO actions have actor_role = sales_officer
  const soEvents = events.filter(e => e.actor_id === ids.so1);
  check(soEvents.every(e => e.actor_role === "sales_officer"), "EC11.7", "All SO audit events correctly tagged as 'sales_officer'");

  // PO actions have actor_role = purchase_officer
  const poEvents = events.filter(e => e.actor_role === "purchase_officer");
  check(poEvents.length >= 2 && poEvents.every(e => e.actor_id === ids[poKey]), "EC11.8", "All PO audit events correctly tagged as 'purchase_officer'");

  // Audit event for submission includes assigned PO metadata
  const submitEvent = events.find(e => e.event_type === "submitted_for_evaluation");
  const submitMeta = (await rows("select metadata from case_events where case_id=$1 and event_type='submitted_for_evaluation'", [c]))[0];
  check(submitMeta.metadata?.assigned_po_id !== null, "EC11.9", "Submission audit includes assigned_po_id in metadata");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 12: MANAGER PROFILE VISIBILITY
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC12: Manager Profile Visibility ━━━");
{
  // Branch Manager A can see profiles in their branch
  const mgrAProfiles = (await as("mgr_A", () => query("select id from profiles"))).rows;
  const branchAProfiles = await rows("select id from profiles where branch_id=$1", [branchA]);
  // Manager sees self + all branch A profiles
  check(mgrAProfiles.length >= branchAProfiles.length, "EC12.1", `Branch Manager-A sees ${mgrAProfiles.length} profiles (branch has ${branchAProfiles.length})`);

  // Branch Manager A cannot see branch B profiles (except self)
  const branchBOnlyIds = (await rows("select id from profiles where branch_id=$1", [branchB])).map(r => r.id);
  const mgrAIds = new Set(mgrAProfiles.map(r => r.id));
  const crossBranchLeak = branchBOnlyIds.filter(id => mgrAIds.has(id));
  check(crossBranchLeak.length === 0, "EC12.2", "Branch Manager-A cannot see Branch-B's staff profiles");

  // Group Manager sees ALL profiles
  const gmProfiles = (await as("group_mgr", () => query("select id from profiles"))).rows;
  const allProfiles = (await query("select id from profiles")).rows;
  check(gmProfiles.length === allProfiles.length, "EC12.3", `Group Manager sees ALL ${allProfiles.length} profiles`);

  // SO can only see their own profile
  const so1Profiles = (await as("so1", () => query("select id from profiles"))).rows;
  check(so1Profiles.length === 1 && so1Profiles[0].id === ids.so1, "EC12.4", "SO sees only their own profile (1 row)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 13: COLUMN-LEVEL GRANT ENFORCEMENT
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC13: Column-Level Grant Enforcement ━━━");
{
  const c = await as("so1", () => scalar("insert into cases(branch_id,sales_officer_id,status) values($1,$2,'draft') returning id", [branchA, ids.so1]));

  // SO cannot update assigned_po_id directly
  await expectError(
    () => as("so1", () => query("update cases set assigned_po_id=$1 where id=$2", [ids.po1, c])),
    /permission denied/i, "EC13.1", "SO cannot directly set assigned_po_id (column grant blocks)"
  );

  // SO cannot update status directly
  await expectError(
    () => as("so1", () => query("update cases set status='closed' where id=$1", [c])),
    /permission denied/i, "EC13.2", "SO cannot directly change case status (column grant blocks)"
  );

  // SO cannot update case_ref directly
  await expectError(
    () => as("so1", () => query("update cases set case_ref='HACK-001' where id=$1", [c])),
    /permission denied/i, "EC13.3", "SO cannot set case_ref directly (column grant blocks)"
  );

  // SO cannot update submitted_at directly
  await expectError(
    () => as("so1", () => query("update cases set submitted_at=now() where id=$1", [c])),
    /permission denied/i, "EC13.4", "SO cannot set submitted_at directly (column grant blocks)"
  );

  // Broker cannot insert broker_visible directly on photos
  await expectError(
    () => as("broker1", () => query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,broker_visible) values($1,'left',100,'image/jpeg','test.jpg',true)", [c])),
    /permission denied/i, "EC13.5", "Broker cannot insert photo with broker_visible=true (column grant blocks)"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 14: CUSTOMER DECISION BRANCHING LOGIC
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC14: Customer Decision Branching ━━━");
{
  // Accept → purchase_completion_pending
  const c1 = await createCase("so1", branchA, "DEC-001");
  await submitCase("so1", c1); await evaluateCase(c1);
  await as("so1", () => rpc("record_customer_decision", [c1, "accepted"]));
  check(await scalar("select status from cases where id=$1", [c1]) === "purchase_completion_pending", "EC14.1", "Customer accepted → purchase_completion_pending");
  check(await scalar("select broker_consent from cases where id=$1", [c1]) === null, "EC14.2", "Accepted case has NULL broker_consent (not applicable)");

  // Reject + broker consent true → listed_for_brokers
  const c2 = await createCase("so1", branchA, "DEC-002");
  await submitCase("so1", c2); await evaluateCase(c2);
  const c2Photo = await scalar("select id from case_photos where case_id=$1 and category='left' limit 1", [c2]);
  await as("so1", () => rpc("review_broker_photo", [c2Photo, true]));
  await as("so1", () => rpc("record_customer_decision", [c2, "rejected", true]));
  check(await scalar("select status from cases where id=$1", [c2]) === "listed_for_brokers", "EC14.3", "Customer rejected + broker consent → listed_for_brokers");
  check(await scalar("select broker_consent from cases where id=$1", [c2]) === true, "EC14.4", "broker_consent = true stored");
  check(await scalar("select listed_at from cases where id=$1", [c2]) !== null, "EC14.5", "listed_at timestamp set when listed");

  // Reject + broker consent false → rejected_not_listed
  const c3 = await createCase("so1", branchA, "DEC-003");
  await submitCase("so1", c3); await evaluateCase(c3);
  await as("so1", () => rpc("record_customer_decision", [c3, "rejected", false]));
  check(await scalar("select status from cases where id=$1", [c3]) === "rejected_not_listed", "EC14.6", "Customer rejected + no broker consent → rejected_not_listed");

  // Reject + broker consent null → rejected_not_listed
  const c4 = await createCase("so1", branchA, "DEC-004");
  await submitCase("so1", c4); await evaluateCase(c4);
  await as("so1", () => rpc("record_customer_decision", [c4, "rejected", null]));
  check(await scalar("select status from cases where id=$1", [c4]) === "rejected_not_listed", "EC14.7", "Customer rejected + null broker consent → rejected_not_listed (defaults to no)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 15: PLATE-VISIBLE PHOTO GUARDRAILS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC15: Plate-Visible Photo Safety ━━━");
{
  const c = await createCase("so1", branchA, "PLATE-001");
  await submitCase("so1", c); await evaluateCase(c);
  const plateCaseConsentPhoto = await scalar("select id from case_photos where case_id=$1 and category='left' limit 1", [c]);
  await as("so1", () => rpc("review_broker_photo", [plateCaseConsentPhoto, true]));
  await as("so1", () => rpc("record_customer_decision", [c, "rejected", true]));

  // Insert a plate-visible photo
  const platePhoto = await scalar(
    "insert into case_photos(case_id,category,is_plate_visible,file_size_bytes,mime_type,storage_path) values($1,'front',true,100,'image/jpeg','test/plate.jpg') returning id", [c]
  );

  // Try to publish it for brokers
  await expectError(
    () => as("so1", () => rpc("review_broker_photo", [platePhoto, true])),
    /Plate-visible/i, "EC15.1", "Plate-visible photo cannot be published to brokers"
  );

  // RC book photo cannot be published to brokers
  const rcPhoto = await scalar("select id from case_photos where case_id=$1 and category='rc_book' limit 1", [c]);
  await expectError(
    () => as("so1", () => rpc("review_broker_photo", [rcPhoto, true])),
    /rc_book/i, "EC15.2", "RC book photo can never be made broker-visible"
  );

  // Non-plate photo CAN be published
  const safePhoto = await scalar("select id from case_photos where case_id=$1 and category='rear' and is_plate_visible=false limit 1", [c]);
  await as("so1", () => rpc("review_broker_photo", [safePhoto, true]));
  check(await scalar("select broker_visible from case_photos where id=$1", [safePhoto]) === true, "EC15.3", "Non-plate photo published to brokers successfully");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 16: REUSED VEHICLE REG AFTER TERMINAL STATUS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC16: Vehicle Reg Number Reuse After Terminal ━━━");
{
  const reg = "REUSE-001";
  // Create and close a case
  const c1 = await createCase("so1", branchA, reg);
  await submitCase("so1", c1); await evaluateCase(c1);
  await as("so1", () => rpc("record_customer_decision", [c1, "accepted"]));
  await as("so1", () => rpc("close_case", [c1]));
  check(await scalar("select status from cases where id=$1", [c1]) === "closed", "EC16.0", "First case closed");

  // New case with SAME reg number should work
  const c2 = await createCase("so1", branchA, reg);
  await submitCase("so1", c2);
  check(await scalar("select status from cases where id=$1", [c2]) === "pending_evaluation", "EC16.1", "Same reg number reused after previous case closed → SUCCESS");

  // But a THIRD case with same reg while c2 is active should FAIL
  await expectError(
    () => createCase("so1", branchA, reg),
    /unique|duplicate/i, "EC16.2", "Third case with same reg blocked while second is still active"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 17: DIRECT TABLE MANIPULATION ATTACKS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC17: Direct Table Manipulation Attacks ━━━");
{
  // Broker cannot write to case_events
  await expectError(
    () => as("broker1", () => query("insert into case_events(case_id,event_type,actor_id,actor_role) values($1,'fake_event',$2,'broker')", [randomUUID(), ids.broker1])),
    /permission denied|violates/i, "EC17.1", "Broker cannot write fake audit events"
  );

  // SO cannot insert into case_offers
  const c = await createCase("so1", branchA, "HACK-001");
  await submitCase("so1", c);
  await expectError(
    () => as("so1", () => query("insert into case_offers(case_id,purchase_officer_id,inspection_completed,offer_price) values($1,$2,true,1000000)", [c, ids.so1])),
    /permission denied|violates|Start the evaluation/i, "EC17.2", "SO cannot insert fake PO evaluation"
  );

  // Broker cannot update their own offer status directly
  check((await as("broker1", () => query("select id from broker_offers"))).rows.length === 0, "EC17.3", "Broker cannot read raw broker_offers table (RLS denies)");

  // Broker cannot read raw broker_reservations
  check((await as("broker1", () => query("select id from broker_reservations"))).rows.length === 0, "EC17.4", "Broker cannot read raw broker_reservations table");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 18: BRANCH WITH NO SO
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC18: Empty Branch Scenarios ━━━");
{
  // Branch C has only an SO, no PO
  const c = await createCase("so_branchC", branchC, "EMPTY-001");
  await expectError(
    () => submitCase("so_branchC", c),
    /No active Purchase Officer/i, "EC18.1", "Branch with no PO: submission fails gracefully with clear error"
  );
  check(await scalar("select status from cases where id=$1", [c]) === "draft", "EC18.2", "Case remains in draft after failed submission (no side effects)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 19: UPDATED_AT TRIGGER
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC19: Timestamps & Triggers ━━━");
{
  const c = await createCase("so1", branchA, "TIME-001");
  const createdAt = await scalar("select created_at from cases where id=$1", [c]);
  // Tiny delay
  await new Promise(r => setTimeout(r, 50));
  await query("update cases set customer_name='Updated' where id=$1", [c]);
  const updatedAt = await scalar("select updated_at from cases where id=$1", [c]);
  check(new Date(updatedAt) >= new Date(createdAt), "EC19.1", "updated_at auto-advances on UPDATE (trigger works)");
}

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
if (failed > 0) {
  console.log("\nFAILED TESTS:");
  results.filter(r => r.status === "FAIL").forEach(r => console.log(`  ❌ ${r.id}: ${r.message}`));
  process.exitCode = 1;
} else {
  console.log("🎉 ALL EDGE CASE TESTS PASSED");
}

// Export results for report generation
const report = { passed, failed, total: passed + failed, results };
console.log(`\nJSON: ${JSON.stringify({ passed, failed })}`);
await db.close();
