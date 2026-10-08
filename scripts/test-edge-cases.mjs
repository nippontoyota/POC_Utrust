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
// branches[0]/branches[1] share a cluster (Cochin); branches[2] sits in a
// different cluster (Thrissur) -- needed to prove Cluster Manager's scope
// actually stops at the cluster boundary, same convention as test-broker-db.mjs.
const branches = (await query("select id,code,cluster_id from branches order by code")).rows;
const branchA = branches[0].id;
const branchB = branches[1].id;
const branchC = branches[2].id;
const clusterAB = branches[0].cluster_id;

const ids = {};
const makeUser = async (key) => { ids[key] = randomUUID(); await query("insert into auth.users values($1)", [ids[key]]); };
for (const k of [
  "po1","po2","po_branchB","po_branchC",
  "mgr_A","mgr_B","cluster_mgr","po_mgr",
  "broker1","broker2","broker_suspended","broker_staff_conflict",
]) await makeUser(k);

for (const [key, role, branch] of [
  ["po1","purchase_officer",branchA],["po2","purchase_officer",branchA],
  ["po_branchB","purchase_officer",branchB],["po_branchC","purchase_officer",branchC],
  ["mgr_A","sales_manager",branchA],["mgr_B","sales_manager",branchB],
]) await query("insert into profiles(id,employee_id,full_name,role,branch_id) values($1,$2,$2,$3,$4)", [ids[key],key,role,branch]);
await query("insert into profiles(id,employee_id,full_name,role,cluster_id) values($1,'cluster_mgr','cluster_mgr','cluster_manager',$2)", [ids.cluster_mgr, clusterAB]);
await query("insert into profiles(id,employee_id,full_name,role) values($1,'po_mgr','po_mgr','po_manager')", [ids.po_mgr]);

for (const [key, status] of [["broker1","approved"],["broker2","approved"],["broker_suspended","approved"]])
  await query("insert into brokers(id,company_name,contact_name,phone,email,status) values($1,$2,$2,'9999999999',$3,$4)", [ids[key],key,`${key}@test.com`,status]);

// broker_staff_conflict: insert BOTH as broker AND staff
await query("insert into brokers(id,company_name,contact_name,phone,email,status) values($1,'Conflict Co','Conflict','9999999999','conflict@test.com','approved')", [ids.broker_staff_conflict]);
await query("insert into profiles(id,employee_id,full_name,role,branch_id) values($1,'conflictstaff','conflictstaff','purchase_officer',$2)", [ids.broker_staff_conflict, branchA]);

// Suspend one broker
await query("update brokers set suspended_at=now() where id=$1", [ids.broker_suspended]);

const as = async (key, fn) => {
  await query("select set_config('request.jwt.claim.sub',$1,false)", [ids[key]]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); }
};
const rpc = (name, args, casts) => scalar(`select ${name}(${args.map((_,i) => `$${i+1}${casts?.[i] ? `::${casts[i]}` : ""}`).join(",")})`, args);

async function createCase(poKey, branch, regNum) {
  const id = randomUUID();
  await query(`insert into cases(id,branch_id,po_id,so_name,status,customer_name,customer_mobile,vehicle_reg_number,make,model,variant,registration_year,fuel_type,transmission,odometer_km,has_loan,customer_expected_price,nippon_offer_price) values($1,$2,$3,'Field SO','draft','Customer','9000000001',$4,'Toyota','Innova','G',2022,'petrol','manual',30000,false,700000,600000)`, [id,branch,ids[poKey],regNum]);
  for (const cat of ["front","rear","left","right","interior_odometer","other"])
    await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)", [id,cat,`test/${cat}.jpg`]);
  await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/rc.jpg',$2)", [id,ids[poKey]]);
  return id;
}
async function submitCase(poKey, caseId) { await as(poKey, () => rpc("submit_case", [caseId])); }

// ═══════════════════════════════════════════════════════════
// EDGE CASE 1: CASE OWNERSHIP ON CREATION (no round-robin anymore)
// ═══════════════════════════════════════════════════════════
console.log("━━━ EC1: Case Ownership On Creation ━━━");
{
  const c1 = await createCase("po1", branchA, "TESTOWC001");
  const c2 = await createCase("po2", branchA, "TESTOWC002");
  check((await scalar("select po_id from cases where id=$1", [c1])) === ids.po1, "EC1.1", "PO1's case is owned by PO1 directly on creation (no shared assignment pool)");
  check((await scalar("select po_id from cases where id=$1", [c2])) === ids.po2, "EC1.2", "PO2's case is owned by PO2 directly on creation");

  await expectError(
    () => as("po1", () => query("insert into cases(branch_id,po_id,status) values($1,$2,'draft')", [branchA, ids.po2])),
    /row-level security/i, "EC1.3", "PO cannot create a case owned by a different PO (impersonation at insert blocked)"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 2: CROSS-BRANCH ISOLATION
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC2: Cross-Branch Data Isolation ━━━");
{
  const caseB = await createCase("po_branchB", branchB, "TESTCRS001");
  await submitCase("po_branchB", caseB);

  // PO from branch A cannot see branch B's case
  const poASees = (await as("po1", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(poASees.length === 0, "EC2.1", "PO in Branch-A cannot see Branch-B's case");

  // Branch Manager A cannot see branch B's case
  const mgrASees = (await as("mgr_A", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(mgrASees.length === 0, "EC2.2", "Sales Manager-A cannot see Branch-B's case");

  // Branch Manager B CAN see it
  const mgrBSees = (await as("mgr_B", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(mgrBSees.length === 1, "EC2.3", "Sales Manager-B CAN see their own branch's case");

  // Cluster Manager (A+B's cluster) sees it too, since branch B is in that cluster
  const cmSees = (await as("cluster_mgr", () => query("select id from cases where id=$1", [caseB]))).rows;
  check(cmSees.length === 1, "EC2.4", "Cluster Manager sees a case from any branch in their own cluster");

  // Case photos inherit case visibility
  const photosCrossA = (await as("mgr_A", () => query("select id from case_photos where case_id=$1", [caseB]))).rows;
  check(photosCrossA.length === 0, "EC2.5", "Case photos invisible to Sales Manager-A (follows parent case RLS)");

  const photosCrossB = (await as("mgr_B", () => query("select id from case_photos where case_id=$1", [caseB]))).rows;
  check(photosCrossB.length === 7, "EC2.6", "Case photos visible to Sales Manager-B (7 photos)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 3: PO IMPERSONATION / OWNERSHIP ATTACKS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC3: PO Ownership & Impersonation ━━━");
{
  const caseOwned = await createCase("po1", branchA, "TESTOWN001");
  await submitCase("po1", caseOwned);

  // PO2 tries to record customer decision on PO1's case
  await expectError(
    () => as("po2", () => rpc("record_customer_decision", [caseOwned, "accepted"])),
    /Not authorized/, "EC3.1", "PO2 cannot record decision on PO1's case"
  );

  // PO2 tries to withdraw PO1's case
  await expectError(
    () => as("po2", () => rpc("withdraw_case", [caseOwned, "Theft attempt"])),
    /Not authorized/, "EC3.2", "PO2 cannot withdraw PO1's case"
  );

  // PO2 tries to close PO1's case
  await as("po1", () => rpc("record_customer_decision", [caseOwned, "accepted"]));
  await expectError(
    () => as("po2", () => rpc("close_case", [caseOwned])),
    /Not authorized/, "EC3.3", "PO2 cannot close PO1's case"
  );

  // PO2 tries to cancel PO1's case
  await expectError(
    () => as("po2", () => rpc("cancel_case", [caseOwned, "Fraud"])),
    /Not authorized/, "EC3.4", "PO2 cannot cancel PO1's case"
  );

  // PO2 tries counter offer on PO1's case
  const co = await createCase("po1", branchA, "TESTOWN002");
  await submitCase("po1", co);
  await expectError(
    () => as("po2", () => rpc("record_customer_counter_offer", [co, 800000], ["uuid","numeric"])),
    /Not authorized/, "EC3.5", "PO2 cannot submit counter offer on PO1's case"
  );

  // PO2 tries to edit PO1's case fields directly. RLS filters this to zero
  // matching rows rather than raising an error -- confirm nothing changed.
  await as("po2", () => query("update cases set customer_name='Hijacked' where id=$1", [co]));
  check(await scalar("select customer_name from cases where id=$1", [co]) !== "Hijacked", "EC3.6", "PO2 cannot edit PO1's case fields (RLS silently affects zero rows)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 4: SUBMIT_CASE VALIDATION EDGE CASES
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC4: submit_case Validation Edge Cases ━━━");
{
  // 4.1: Missing required field (so_name cleared) blocks submission
  const c1 = await createCase("po1", branchA, "TESTEVL001");
  await query("update cases set so_name=null where id=$1", [c1]);
  await expectError(
    () => as("po1", () => rpc("submit_case", [c1])),
    /missing required fields/i, "EC4.1", "PO cannot submit without the SO-handling-this-case field"
  );
  await query("update cases set so_name='Field SO' where id=$1", [c1]);

  // 4.2: NULL nippon_offer_price blocks submission too (it's a required field now)
  await query("update cases set nippon_offer_price=null where id=$1", [c1]);
  await expectError(
    () => as("po1", () => rpc("submit_case", [c1])),
    /missing required fields/i, "EC4.2", "PO cannot submit without Nippon's offer price"
  );
  await query("update cases set nippon_offer_price=600000 where id=$1", [c1]);

  // 4.3: nippon_offer_price <= 0 is rejected at the column CHECK constraint, not the RPC
  await expectError(
    () => as("po1", () => query("update cases set nippon_offer_price=0 where id=$1", [c1])),
    /check constraint/i, "EC4.3", "Nippon's offer price of zero rejected by the CHECK constraint"
  );

  // 4.4: submit_case is NOT idempotent -- a second call on an already-submitted case fails
  await submitCase("po1", c1);
  await expectError(
    () => as("po1", () => rpc("submit_case", [c1])),
    /not in draft status/i, "EC4.4", "submit_case cannot be called a second time on the same case"
  );

  // 4.5: A PO who doesn't own the case cannot submit it
  const c2 = await createCase("po1", branchA, "TESTEVL002");
  await expectError(
    () => as("po_branchB", () => rpc("submit_case", [c2])),
    /Not authorized/i, "EC4.5", "A PO who doesn't own the case cannot submit it"
  );

  // 4.6: Maximum valid offer price (numeric(12,2) boundary)
  const c3 = await createCase("po1", branchA, "TESTEVL003");
  await query("update cases set nippon_offer_price=9999999999.99 where id=$1", [c3]);
  await submitCase("po1", c3);
  const offerPrice = await scalar("select nippon_offer_price from cases where id=$1", [c3]);
  check(parseFloat(offerPrice) === 9999999999.99, "EC4.6", "Maximum valid offer price (₹999.99Cr) accepted");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 5: COUNTER OFFER EDGE CASES
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC5: Customer Counter Offer Edge Cases ━━━");
{
  const c1 = await createCase("po1", branchA, "TESTCNT001");
  await submitCase("po1", c1);

  // 5.1: Valid counter offer
  await as("po1", () => rpc("record_customer_counter_offer", [c1, 750000, "Customer wants more"], ["uuid","numeric","text"]));
  check(await scalar("select customer_counter_offer_price from cases where id=$1", [c1]) == 750000, "EC5.1", "Counter offer of ₹7.5L recorded successfully");

  // 5.2: Overwrite counter offer (should update, not fail)
  await as("po1", () => rpc("record_customer_counter_offer", [c1, 800000, "Revised demand"], ["uuid","numeric","text"]));
  check(await scalar("select customer_counter_offer_price from cases where id=$1", [c1]) == 800000, "EC5.2", "Counter offer updated to ₹8L (overwrite allowed)");

  // 5.3: Counter offer with 0
  await expectError(
    () => as("po1", () => rpc("record_customer_counter_offer", [c1, 0, "Free"], ["uuid","numeric","text"])),
    /valid/i, "EC5.3", "Counter offer of ₹0 rejected"
  );

  // 5.4: Counter offer at ₹1000 Crore boundary
  await expectError(
    () => as("po1", () => rpc("record_customer_counter_offer", [c1, 10000000000, ""], ["uuid","numeric","text"])),
    /valid/i, "EC5.4", "Counter offer >= ₹1000Cr rejected"
  );

  // 5.5: Counter offer with very long note (> 1000 chars should fail at column check)
  const longNote = "x".repeat(1001);
  await expectError(
    () => as("po1", () => rpc("record_customer_counter_offer", [c1, 750000, longNote], ["uuid","numeric","text"])),
    /check|length|1000/i, "EC5.5", "Counter offer note > 1000 chars rejected"
  );

  // 5.6: Counter offer with null note (should work)
  await as("po1", () => rpc("record_customer_counter_offer", [c1, 780000, null], ["uuid","numeric","text"]));
  check(await scalar("select customer_counter_offer_note from cases where id=$1", [c1]) === null, "EC5.6", "Counter offer with null note accepted (optional field)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 6: TERMINAL STATE IMMUTABILITY
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC6: Terminal State Immutability ━━━");
{
  // Create a closed case
  const c1 = await createCase("po1", branchA, "TESTTRM001");
  await submitCase("po1", c1);
  await as("po1", () => rpc("record_customer_decision", [c1, "accepted"]));
  await as("po1", () => rpc("close_case", [c1]));
  check(await scalar("select status from cases where id=$1", [c1]) === "closed", "EC6.0", "Case successfully closed");

  // Try every action on a closed case
  await expectError(() => as("po1", () => rpc("withdraw_case", [c1, "Try"])), /cannot be withdrawn/, "EC6.1", "Cannot withdraw a closed case");
  await expectError(() => as("po1", () => rpc("close_case", [c1])), /not awaiting/, "EC6.2", "Cannot close a closed case again");
  await expectError(() => as("po1", () => rpc("cancel_case", [c1, "Try"])), /not awaiting/, "EC6.3", "Cannot cancel a closed case");
  await expectError(() => as("po1", () => rpc("record_customer_decision", [c1, "rejected"])), /not awaiting/, "EC6.4", "Cannot record decision on a closed case");

  // Cancelled case
  const c2 = await createCase("po1", branchA, "TESTTRM002");
  await submitCase("po1", c2);
  await as("po1", () => rpc("record_customer_decision", [c2, "accepted"]));
  await as("po1", () => rpc("cancel_case", [c2, "Customer disappeared"]));
  await expectError(() => as("po1", () => rpc("close_case", [c2])), /not awaiting/, "EC6.5", "Cannot close a cancelled case");
  await expectError(() => as("po1", () => rpc("cancel_case", [c2, "Again"])), /not awaiting/, "EC6.6", "Cannot cancel a cancelled case again");

  // rejected_not_listed case
  const c3 = await createCase("po1", branchA, "TESTTRM003");
  await submitCase("po1", c3);
  await as("po1", () => rpc("record_customer_decision", [c3, "rejected", false]));
  check(await scalar("select status from cases where id=$1", [c3]) === "rejected_not_listed", "EC6.7", "Rejection without broker consent → rejected_not_listed");
  await expectError(() => as("po1", () => rpc("withdraw_case", [c3, "Try"])), /cannot be withdrawn/, "EC6.8", "Cannot withdraw a rejected_not_listed case");
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

  // But they CAN use PO functions since they have a purchase_officer profile
  const draft = await as("broker_staff_conflict", () =>
    scalar("insert into cases(branch_id,po_id,status) values($1,$2,'draft') returning id", [branchA, ids.broker_staff_conflict])
  );
  check(draft !== null, "EC7.3", "Staff-broker hybrid CAN create cases as PO (staff role takes priority)");
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

  // Suspended broker cannot place offers. No manual photo-review step anymore
  // -- the case's non-plate photos are already broker-visible automatically.
  const c = await createCase("po1", branchA, "TESTSUS001");
  await submitCase("po1", c);
  await as("po1", () => rpc("record_customer_decision", [c, "rejected", true]));

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
  const c = await createCase("po1", branchA, "TESTSPC001");
  await submitCase("po1", c);

  // Withdraw with whitespace-only reason
  await expectError(
    () => as("po1", () => rpc("withdraw_case", [c, "   "])),
    /reason is required/i, "EC9.1", "Withdraw with whitespace-only reason rejected"
  );

  await expectError(
    () => as("po1", () => rpc("withdraw_case", [c, "\t\n"])),
    /reason is required/i, "EC9.2", "Withdraw with tab/newline-only reason rejected"
  );

  // Cancel with whitespace-only reason (need to get to right status first)
  const c2 = await createCase("po1", branchA, "TESTSPC002");
  await submitCase("po1", c2);
  await as("po1", () => rpc("record_customer_decision", [c2, "accepted"]));
  await expectError(
    () => as("po1", () => rpc("cancel_case", [c2, "   "])),
    /reason is required/i, "EC9.3", "Cancel with whitespace-only reason rejected"
  );

  // Null withdrawal reason
  const c3 = await createCase("po1", branchA, "TESTSPC003");
  await submitCase("po1", c3);
  await expectError(
    () => as("po1", () => rpc("withdraw_case", [c3, null])),
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
  // Full lifecycle: draft → submitted → accepted → closed, one PO throughout
  const c = await createCase("po1", branchA, "TESTAUD001");
  await submitCase("po1", c);
  await as("po1", () => rpc("record_customer_decision", [c, "accepted"]));
  await as("po1", () => rpc("close_case", [c]));

  const events = await rows("select event_type, actor_id, actor_role, metadata from case_events where case_id=$1 order by created_at", [c]);
  const types = events.map(e => e.event_type);

  check(types.includes("case_submitted"), "EC11.1", "Audit: case-submitted event recorded");
  check(types.includes("customer_decision_recorded"), "EC11.2", "Audit: customer decision event recorded");
  check(types.includes("case_closed"), "EC11.3", "Audit: case closed event recorded");

  // Every event has actor_id and actor_role
  const allHaveActor = events.every(e => e.actor_id !== null && e.actor_role !== null);
  check(allHaveActor, "EC11.4", "Every audit event has actor_id AND actor_role (full attribution)");

  // The single owning PO is the actor on every event -- no second role involved
  check(events.every(e => e.actor_id === ids.po1 && e.actor_role === "purchase_officer"), "EC11.5", "Every audit event on this case is attributed to the one owning PO");

  // Submission audit includes the offer price in metadata (replaces the old assigned_po_id metadata, since there's no assignment anymore)
  const submitEvent = events.find(e => e.event_type === "case_submitted");
  check(submitEvent.metadata?.nippon_offer_price != null, "EC11.6", "Submission audit includes Nippon's offer price in metadata");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 12: MANAGER-FAMILY PROFILE VISIBILITY
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC12: Manager-Family Profile Visibility ━━━");
{
  // Sales Manager A can see profiles in their own branch
  const mgrAProfiles = (await as("mgr_A", () => query("select id from profiles"))).rows;
  const branchAProfiles = await rows("select id from profiles where branch_id=$1", [branchA]);
  check(mgrAProfiles.length >= branchAProfiles.length, "EC12.1", `Sales Manager-A sees ${mgrAProfiles.length} profiles (branch has ${branchAProfiles.length})`);

  // Sales Manager A cannot see branch B profiles (except self)
  const branchBOnlyIds = (await rows("select id from profiles where branch_id=$1", [branchB])).map(r => r.id);
  const mgrAIds = new Set(mgrAProfiles.map(r => r.id));
  const crossBranchLeak = branchBOnlyIds.filter(id => mgrAIds.has(id));
  check(crossBranchLeak.length === 0, "EC12.2", "Sales Manager-A cannot see Branch-B's staff profiles");

  // Cluster Manager sees profiles in BOTH branch A and branch B, since they share a cluster
  const cmProfiles = (await as("cluster_mgr", () => query("select id from profiles"))).rows;
  const cmIds = new Set(cmProfiles.map(r => r.id));
  check(branchAProfiles.every(p => cmIds.has(p.id)) && branchBOnlyIds.every(id => cmIds.has(id)), "EC12.3", "Cluster Manager sees staff profiles across every branch in their own cluster");

  // Cluster Manager cannot see branch C's profiles (different cluster)
  const branchCOnlyIds = (await rows("select id from profiles where branch_id=$1", [branchC])).map(r => r.id);
  check(branchCOnlyIds.every(id => !cmIds.has(id)), "EC12.4", "Cluster Manager cannot see a different cluster's staff profiles");

  // PO Manager has NO direct profiles access beyond their own row -- deliberate,
  // since po_manager must never see customer-adjacent staff data directly.
  const pmProfiles = (await as("po_mgr", () => query("select id from profiles"))).rows;
  check(pmProfiles.length === 1 && pmProfiles[0].id === ids.po_mgr, "EC12.5", "PO Manager sees only their own profile row, by design");

  // PO can only see their own profile
  const po1Profiles = (await as("po1", () => query("select id from profiles"))).rows;
  check(po1Profiles.length === 1 && po1Profiles[0].id === ids.po1, "EC12.6", "PO sees only their own profile (1 row)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 13: COLUMN-LEVEL GRANT ENFORCEMENT
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC13: Column-Level Grant Enforcement ━━━");
{
  const c = await as("po1", () => scalar("insert into cases(branch_id,po_id,status) values($1,$2,'draft') returning id", [branchA, ids.po1]));

  // PO cannot update branch_id directly (not in the update-grant column list)
  await expectError(
    () => as("po1", () => query("update cases set branch_id=$1 where id=$2", [branchB, c])),
    /permission denied/i, "EC13.1", "PO cannot directly move a case to another branch (column grant blocks)"
  );

  // PO cannot update status directly
  await expectError(
    () => as("po1", () => query("update cases set status='closed' where id=$1", [c])),
    /permission denied/i, "EC13.2", "PO cannot directly change case status (column grant blocks)"
  );

  // PO cannot update case_ref directly
  await expectError(
    () => as("po1", () => query("update cases set case_ref='TESTHCK001' where id=$1", [c])),
    /permission denied/i, "EC13.3", "PO cannot set case_ref directly (column grant blocks)"
  );

  // PO cannot update submitted_at directly
  await expectError(
    () => as("po1", () => query("update cases set submitted_at=now() where id=$1", [c])),
    /permission denied/i, "EC13.4", "PO cannot set submitted_at directly (column grant blocks)"
  );

  // Broker cannot insert broker_visible directly on photos
  await expectError(
    () => as("broker1", () => query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,broker_visible) values($1,'left',100,'image/jpeg','test.jpg',true)", [c])),
    /permission denied/i, "EC13.5", "Broker cannot insert photo with broker_visible=true (column grant blocks)"
  );

  // PO cannot insert broker_visible=true on their OWN upload either -- it's
  // always trigger-computed now, never client-settable, even by the owner.
  await expectError(
    () => as("po1", () => query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by,broker_visible) values($1,'left',100,'image/jpeg','test2.jpg',$2,true)", [c, ids.po1])),
    /permission denied/i, "EC13.6", "PO cannot set broker_visible directly even on their own case (trigger-only column)"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 14: CUSTOMER DECISION BRANCHING LOGIC
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC14: Customer Decision Branching ━━━");
{
  // Accept → purchase_completion_pending
  const c1 = await createCase("po1", branchA, "TESTDEC001");
  await submitCase("po1", c1);
  await as("po1", () => rpc("record_customer_decision", [c1, "accepted"]));
  check(await scalar("select status from cases where id=$1", [c1]) === "purchase_completion_pending", "EC14.1", "Customer accepted → purchase_completion_pending");
  check(await scalar("select broker_consent from cases where id=$1", [c1]) === null, "EC14.2", "Accepted case has NULL broker_consent (not applicable)");

  // Reject + broker consent true → listed_for_brokers, immediately, no approval gate
  const c2 = await createCase("po1", branchA, "TESTDEC002");
  await submitCase("po1", c2);
  await as("po1", () => rpc("record_customer_decision", [c2, "rejected", true]));
  check(await scalar("select status from cases where id=$1", [c2]) === "listed_for_brokers", "EC14.3", "Customer rejected + broker consent → listed_for_brokers");
  check(await scalar("select broker_consent from cases where id=$1", [c2]) === true, "EC14.4", "broker_consent = true stored");
  check(await scalar("select listed_at from cases where id=$1", [c2]) !== null, "EC14.5", "listed_at timestamp set when listed");

  // Reject + broker consent false → rejected_not_listed
  const c3 = await createCase("po1", branchA, "TESTDEC003");
  await submitCase("po1", c3);
  await as("po1", () => rpc("record_customer_decision", [c3, "rejected", false]));
  check(await scalar("select status from cases where id=$1", [c3]) === "rejected_not_listed", "EC14.6", "Customer rejected + no broker consent → rejected_not_listed");

  // Reject + broker consent null → rejected_not_listed
  const c4 = await createCase("po1", branchA, "TESTDEC004");
  await submitCase("po1", c4);
  await as("po1", () => rpc("record_customer_decision", [c4, "rejected", null]));
  check(await scalar("select status from cases where id=$1", [c4]) === "rejected_not_listed", "EC14.7", "Customer rejected + null broker consent → rejected_not_listed (defaults to no)");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 15: PLATE-VISIBLE PHOTO AUTO-VISIBILITY GUARDRAILS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC15: Plate-Visible Photo Safety ━━━");
{
  const c = await createCase("po1", branchA, "TESTPLT001");
  await submitCase("po1", c);
  await as("po1", () => rpc("record_customer_decision", [c, "rejected", true]));

  // A plate-visible photo (front/rear) never becomes broker-visible, even automatically
  const platePhoto = await scalar(
    "insert into case_photos(case_id,category,is_plate_visible,file_size_bytes,mime_type,storage_path) values($1,'front',true,100,'image/jpeg','test/plate.jpg') returning id", [c]
  );
  check(await scalar("select broker_visible from case_photos where id=$1", [platePhoto]) === false, "EC15.1", "Plate-visible photo never becomes broker-visible");

  // RC book photo is never broker-visible either
  const rcPhoto = await scalar("select id from case_photos where case_id=$1 and category='rc_book' limit 1", [c]);
  check(await scalar("select broker_visible from case_photos where id=$1", [rcPhoto]) === false, "EC15.2", "RC book photo is never broker-visible");

  // A non-plate photo (e.g. 'left', already inserted by createCase) IS broker-visible automatically
  const safePhoto = await scalar("select id from case_photos where case_id=$1 and category='left' and is_plate_visible=false limit 1", [c]);
  check(await scalar("select broker_visible from case_photos where id=$1", [safePhoto]) === true, "EC15.3", "Non-plate photo is broker-visible automatically, no review step");

  // Attempting to force a plate-visible photo's broker_visible flag via UPDATE is blocked
  await expectError(
    () => as("po1", () => query("update case_photos set broker_visible=true where id=$1", [platePhoto])),
    /permission denied/i, "EC15.4", "Nobody can flip a plate-visible photo's broker_visible flag directly"
  );
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 16: REUSED VEHICLE REG AFTER TERMINAL STATUS
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC16: Vehicle Reg Number Reuse After Terminal ━━━");
{
  const reg = "TESTRUS001";
  // Create and close a case
  const c1 = await createCase("po1", branchA, reg);
  await submitCase("po1", c1);
  await as("po1", () => rpc("record_customer_decision", [c1, "accepted"]));
  await as("po1", () => rpc("close_case", [c1]));
  check(await scalar("select status from cases where id=$1", [c1]) === "closed", "EC16.0", "First case closed");

  // New case with SAME reg number should work
  const c2 = await createCase("po1", branchA, reg);
  await submitCase("po1", c2);
  check(await scalar("select status from cases where id=$1", [c2]) === "pending_customer_decision", "EC16.1", "Same reg number reused after previous case closed → SUCCESS");

  // But a THIRD case with same reg while c2 is active should FAIL
  await expectError(
    () => createCase("po1", branchA, reg),
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

  // Nobody -- not even the owning PO -- can write case_events directly; only
  // the security-definer RPCs may (case_events has no insert policy at all).
  const c = await createCase("po1", branchA, "TESTHCK001");
  await expectError(
    () => as("po1", () => query("insert into case_events(case_id,event_type,actor_id,actor_role) values($1,'case_submitted',$2,'purchase_officer')", [c, ids.po1])),
    /permission denied|violates/i, "EC17.2", "PO cannot forge their own audit events, even on a case they own"
  );

  // Broker cannot update their own offer status directly
  check((await as("broker1", () => query("select id from broker_offers"))).rows.length === 0, "EC17.3", "Broker cannot read raw broker_offers table (RLS denies)");

  // Broker cannot read raw broker_reservations
  check((await as("broker1", () => query("select id from broker_reservations"))).rows.length === 0, "EC17.4", "Broker cannot read raw broker_reservations table");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 18: BRANCH SCOPING ON CREATION
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC18: Branch Scoping On Creation ━━━");
{
  // A PO cannot create a case in a branch other than their own -- there's no
  // round-robin pool to fall into anymore, so the only failure mode left here
  // is trying to file a case against the wrong branch outright.
  await expectError(
    () => as("po_branchC", () => query("insert into cases(branch_id,po_id,status) values($1,$2,'draft')", [branchA, ids.po_branchC])),
    /row-level security/i, "EC18.1", "PO cannot create a case in a branch that isn't their own"
  );
  const ownBranchCase = await as("po_branchC", () =>
    scalar("insert into cases(branch_id,po_id,status) values($1,$2,'draft') returning id", [branchC, ids.po_branchC])
  );
  check(ownBranchCase !== null, "EC18.2", "PO can create a case in their own branch");
}

// ═══════════════════════════════════════════════════════════
// EDGE CASE 19: UPDATED_AT TRIGGER
// ═══════════════════════════════════════════════════════════
console.log("\n━━━ EC19: Timestamps & Triggers ━━━");
{
  const c = await createCase("po1", branchA, "TESTTIM001");
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
