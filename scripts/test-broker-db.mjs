// Isolated PostgreSQL tests. Never connects to the project's Supabase database.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
const query = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) =>
  Object.values((await query(sql, args)).rows[0])[0];
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
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`Migration ${file}: ${error.message}`, { cause: error });
  }
}
console.log("All migrations applied to isolated PostgreSQL.");
const branches = (await query("select id from branches order by code limit 2"))
  .rows;
const ids = Object.fromEntries(
  [
    "so",
    "otherSo",
    "po",
    "manager",
    "group",
    "broker1",
    "broker2",
    "pending",
  ].map((k) => [k, randomUUID()]),
);
for (const id of Object.values(ids))
  await query("insert into auth.users values($1)", [id]);
for (const [key, role, branch, group] of [
  ["so", "sales_officer", 0, false],
  ["otherSo", "sales_officer", 1, false],
  ["po", "purchase_officer", 0, false],
  ["manager", "manager", 0, false],
  ["group", "manager", 0, true],
]) {
  await query(
    "insert into profiles(id,employee_id,full_name,role,branch_id,is_group_manager) values($1,$2,$2,$3,$4,$5)",
    [ids[key], key, role, branches[branch].id, group],
  );
}
for (const key of ["broker1", "broker2", "pending"])
  await query(
    "insert into brokers(id,company_name,contact_name,phone,email,status) values($1,$2,$2,'1234567890',$3,$4)",
    [
      ids[key],
      key,
      `${key}@example.test`,
      key === "pending" ? "pending" : "approved",
    ],
  );
const as = async (key, fn) => {
  await query("select set_config('request.jwt.claim.sub',$1,false)", [
    ids[key] ?? "",
  ]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
};
const rpc = (name, args, casts) =>
  scalar(
    `select ${name}(${args.map((_, i) => `$${i + 1}${casts?.[i] ? `::${casts[i]}` : ""}`).join(",")})`,
    args,
  );
const act = (key, id, action, payload = {}) =>
  as(key, () =>
    rpc(
      "broker_case_action",
      [id, action, JSON.stringify(payload)],
      ["uuid", "text", "jsonb"],
    ),
  );
const market = (key, id, view = "marketplace") =>
  as(key, () => rpc("broker_marketplace", ["", null, view, 0, "newest", id]));
const fail = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
  checks++;
};
async function newCase(branch = 0, state = "listed_for_brokers") {
  const id = randomUUID();
  await query(
    `insert into cases(id,branch_id,sales_officer_id,assigned_po_id,status,case_ref,broker_consent,listed_at,make,model,variant,registration_year,odometer_km,fuel_type,transmission,customer_name,customer_mobile,customer_expected_price)
    values($1,$2,$3,$4,$5,$6,true,now(),'Toyota','Innova','G',2020,30000,'diesel','manual','PRIVATE NAME','PRIVATE PHONE',700000)`,
    [
      id,
      branches[branch].id,
      branch === 0 ? ids.so : ids.otherSo,
      ids.po,
      state,
      `TEST-${id.slice(0, 8)}`,
    ],
  );
  const photo = await scalar(
    "insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,'left',100,'image/jpeg','test/left.jpg') returning id",
    [id],
  );
  return { id, photo };
}
const offer = async (key, id, amount, revision = 0) => {
  const result = await act(key, id, "offer", { amount, revision });
  assert.equal(result.ok, true, JSON.stringify(result));
  return (
    await query(
      "select * from broker_offers where case_id=$1 and broker_id=$2",
      [id, ids[key]],
    )
  ).rows[0];
};
const select = async (id, o, reason = "") => {
  const result = await act("so", id, "select", {
    offer_id: o.id,
    revision: o.revision,
    reason,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return (
    await query(
      "select * from broker_reservations where case_id=$1 and status='active'",
      [id],
    )
  ).rows[0];
};

const c = await newCase();
check(
  (await market("broker1", c.id)).total === 0,
  "Unreviewed listings hidden",
);
await fail(() => market("pending", c.id), /Approved broker/);
await fail(
  () => as("otherSo", () => rpc("review_broker_photo", [c.photo, true])),
  /Case owner/,
);
await as("so", () => rpc("review_broker_photo", [c.photo, true]));
const visible = await market("broker1", c.id);
check(
  visible.total === 1 && visible.items[0].photos.length === 1,
  "Reviewed listing visible",
);
const text = JSON.stringify(visible);
check(
  !text.includes("PRIVATE") &&
    !text.includes("700000") &&
    !text.includes("storage_path"),
  "No customer, internal pricing or storage paths exposed",
);
check(
  (await as("broker1", () => query("select * from cases"))).rows.length === 0,
  "RLS denies raw cases",
);
check(
  (await as("broker1", () => query("select * from case_photos"))).rows
    .length === 0,
  "RLS denies raw photo metadata",
);
await fail(
  () =>
    as("broker1", () =>
      rpc("marketplace_finish_hold", [randomUUID(), "released", "hack"]),
    ),
  /permission denied/,
);
await fail(
  () =>
    as("broker1", () =>
      query("update cases set evaluation_started_at=now() where id=$1", [c.id]),
    ),
  /permission denied/,
);
const low = await offer("broker1", c.id, 520000);
const high = await offer("broker2", c.id, 540000);
const own = JSON.stringify(await market("broker1", c.id));
check(
  !own.includes("540000") && !own.includes(ids.broker2),
  "Competing offer hidden",
);
check(
  (
    await act("so", c.id, "select", {
      offer_id: low.id,
      revision: low.revision,
    })
  ).error,
  "Lower selection requires reason",
);
await fail(
  () =>
    act("otherSo", c.id, "select", {
      offer_id: high.id,
      revision: high.revision,
    }),
  /Not authorized/,
);
const hold = await select(c.id, high);
check(
  Date.parse(hold.expires_at) - Date.parse(hold.started_at) === 48 * 3600000,
  "Hold lasts exactly 48 hours",
);
check(
  (
    await act("so", c.id, "select", {
      offer_id: low.id,
      revision: low.revision,
      reason: "Repeat",
    })
  ).error,
  "Duplicate selection rejected",
);
check(
  (
    await act("broker1", c.id, "offer", {
      amount: 550000,
      revision: low.revision,
    })
  ).error,
  "Bidding paused during hold",
);
await fail(
  () =>
    act("broker1", c.id, "release", {
      reservation_id: hold.id,
      reason: "Other broker",
    }),
  /Not authorized/,
);
check(
  (
    await act("so", c.id, "complete", {
      reservation_id: hold.id,
      payment_complete: true,
      handover_complete: true,
    })
  ).error,
  "Cannot close without customer acceptance",
);
await act("so", c.id, "accept", { reservation_id: hold.id });
check(
  (
    await scalar("select expires_at from broker_reservations where id=$1", [
      hold.id,
    ])
  ).toISOString() === new Date(hold.expires_at).toISOString(),
  "Acceptance does not extend hold",
);
await query(
  "update broker_reservations set started_at=now()-interval '49 hours', expires_at=now()-interval '1 second' where id=$1",
  [hold.id],
);
const expiredRead = (await market("broker2", c.id)).items[0];
check(
  expiredRead.availability === "open" &&
    expiredRead.own_offer.status === "reconfirm",
  "Reads honor expiry before cron runs",
);
check(
  (
    await act("so", c.id, "complete", {
      reservation_id: hold.id,
      payment_complete: true,
      handover_complete: true,
    })
  ).error,
  "Expired completion rejected",
);
check(
  (await scalar("select status from broker_reservations where id=$1", [
    hold.id,
  ])) === "expired",
  "Expiry persists when stale mutation is rejected",
);
check(
  (await scalar(
    "select count(*)::int from broker_offers where case_id=$1 and status='reconfirm'",
    [c.id],
  )) === 2,
  "Both offers require reconfirmation",
);
const reconfirmed = await offer("broker1", c.id, 530000, low.revision);
const second = await select(c.id, reconfirmed);
await act("so", c.id, "accept", { reservation_id: second.id });
check(
  (
    await act("so", c.id, "complete", {
      reservation_id: second.id,
      payment_complete: true,
      handover_complete: false,
    })
  ).error,
  "Handover required",
);
check(
  (
    await act("so", c.id, "complete", {
      reservation_id: second.id,
      payment_complete: true,
      handover_complete: true,
    })
  ).ok,
  "Accepted paid and handed-over deal completes",
);
check(
  (
    await act("so", c.id, "complete", {
      reservation_id: second.id,
      payment_complete: true,
      handover_complete: true,
    })
  ).error,
  "Duplicate completion rejected",
);
check(
  (await market("broker1", c.id)).total === 0,
  "Closed case removed from marketplace",
);
check(
  (await market("broker1", c.id, "history")).items[0].reservations.length === 1,
  "Broker sees only own reservation history",
);

const d = await newCase();
await as("so", () => rpc("review_broker_photo", [d.photo, true]));
const dOffer = await offer("broker1", d.id, 400000);
const dHold = await select(d.id, dOffer);
await fail(
  () =>
    as("manager", () =>
      rpc("manage_broker", [ids.broker1, "suspend", "Branch manager"]),
    ),
  /group manager/,
);
await as("group", () =>
  rpc("manage_broker", [ids.broker1, "suspend", "Access review"]),
);
check(
  (await scalar("select status from broker_reservations where id=$1", [
    dHold.id,
  ])) === "released",
  "Suspension releases active hold",
);
await fail(() => market("broker1", d.id), /Approved broker/);
await as("group", () =>
  rpc("manage_broker", [ids.broker1, "reactivate", "Review complete"]),
);
check(
  (await scalar("select status from broker_offers where id=$1", [
    dOffer.id,
  ])) === "withdrawn",
  "Reactivation does not resurrect offers",
);
await act("so", d.id, "withdraw_consent", { reason: "Customer opted out" });
check(
  (await market("broker2", d.id)).total === 0,
  "Consent withdrawal delists case",
);
await as("group", () =>
  rpc("manage_broker", [ids.pending, "approve", "Identity checked"]),
);
check(
  (await scalar("select status from brokers where id=$1", [ids.pending])) ===
    "approved",
  "Group manager approves broker",
);

const other = await newCase(1);
await as("otherSo", () => rpc("review_broker_photo", [other.photo, true]));
check(
  (await market("broker1", other.id)).total === 1,
  "Broker can browse across branches",
);
await fail(
  () => as("manager", () => rpc("staff_broker_case", [other.id])),
  /Not authorized/,
);
const report = await as("manager", () => rpc("broker_report", []));
check(
  report.completed === 1 && report.deal_value === 530000,
  "One completed deal counted despite earlier expired attempt",
);
check(
  !report.cases.some((row) => row.id === other.id),
  "Manager report respects branch scope",
);
check(
  (await as("group", () => rpc("broker_report", []))).cases.some(
    (row) => row.id === other.id,
  ),
  "Group manager sees all branches",
);
check(
  (
    await as("manager", () =>
      rpc("broker_report", ["2099-01-01", "2099-12-31"]),
    )
  ).completed === 0,
  "Report date range applied",
);

const e = await newCase(0, "pending_evaluation");
await fail(
  () =>
    as("po", () =>
      rpc("submit_po_evaluation", [e.id, true, "Inspected", 300000]),
    ),
  /Start the evaluation/,
);
await as("po", () => rpc("start_po_evaluation", [e.id]));
await as("po", () =>
  rpc("submit_po_evaluation", [e.id, true, "Inspected", 300000]),
);
await as("so", () => rpc("record_customer_decision", [e.id, "accepted", null]));
await as("so", () => rpc("close_case", [e.id]));
check(
  (await scalar("select status from cases where id=$1", [e.id])) === "closed",
  "Direct purchase workflow still completes",
);
await rpc("expire_broker_reservations", []);
await rpc("expire_broker_reservations", []);
check(
  (await scalar(
    "select count(*)::int from broker_reservations where status='completed'",
  )) === 1,
  "Expiry job is idempotent",
);

const f = await newCase();
const plate = await scalar(
  "insert into case_photos(case_id,category,is_plate_visible,file_size_bytes,mime_type,storage_path) values($1,'front',true,100,'image/jpeg','test/front.jpg') returning id",
  [f.id],
);
await fail(
  () => as("so", () => rpc("review_broker_photo", [plate, true])),
  /Plate-visible/,
);
await fail(
  () =>
    as("so", () =>
      query("update case_photos set broker_visible=true where id=$1", [plate]),
    ),
  /permission denied/,
);
await as("so", () => rpc("review_broker_photo", [f.photo, true]));
await fail(
  () =>
    as("so", () =>
      query(
        "insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by,broker_visible) values($1,'left',100,'image/jpeg','test/unsafe.jpg',$2,true)",
        [f.id, ids.so],
      ),
    ),
  /permission denied/,
);
check(
  (await act("broker1", f.id, "offer", { amount: 0, revision: 0 })).error,
  "Zero price rejected",
);
check(
  (await act("broker1", f.id, "offer", { amount: 10.001, revision: 0 })).error,
  "Sub-paisa price rejected",
);
const f1 = await offer("broker1", f.id, 500000);
check(
  (await act("broker1", f.id, "offer", { amount: 501000, revision: 0 })).error,
  "Stale revision cannot overwrite offer",
);
const f2 = await offer("broker2", f.id, 510000);
check(
  (await as("so", () => rpc("so_broker_summary", []))).awaiting_selection >= 1,
  "SO receives offer-selection count",
);
const results = await Promise.all([
  act("so", f.id, "select", {
    offer_id: f1.id,
    revision: f1.revision,
    reason: "Broker availability",
  }),
  act("so", f.id, "select", { offer_id: f2.id, revision: f2.revision }),
]);
check(
  results.filter((r) => r.ok).length === 1,
  "Overlapping selection requests produce one successful hold",
);
check(
  (await scalar(
    "select count(*)::int from broker_reservations where case_id=$1 and status='active'",
    [f.id],
  )) === 1,
  "One-active-hold invariant preserved",
);
const fHold = (
  await query(
    "select * from broker_reservations where case_id=$1 and status='active'",
    [f.id],
  )
).rows[0];
await act("so", f.id, "reject", {
  reservation_id: fHold.id,
  reason: "Customer rejected broker price",
});
check(
  (await scalar(
    "select customer_decision from broker_reservations where id=$1",
    [fHold.id],
  )) === "rejected",
  "Broker-route rejection preserved on the attempt",
);
check(
  (await scalar("select status from cases where id=$1", [f.id])) ===
    "listed_for_brokers",
  "Customer rejection reopens bidding",
);
const f3 = await offer("broker2", f.id, 520000, f2.revision);
const fNext = await select(f.id, f3);
await act("broker2", f.id, "release", {
  reservation_id: fNext.id,
  reason: "Transport unavailable",
});
check(
  (await scalar("select status from broker_reservations where id=$1", [
    fNext.id,
  ])) === "released",
  "Selected broker can release own hold",
);
const f4 = await offer("broker2", f.id, 520000, f3.revision);
const fLast = await select(f.id, f4);
await query(
  "update broker_reservations set started_at=now()-interval '48 hours', expires_at=now() where id=$1",
  [fLast.id],
);
check(
  (await market("broker2", f.id)).items[0].availability === "open",
  "Deadline boundary is exclusive",
);
check(
  (await as("so", () => rpc("so_broker_summary", []))).reserved === 0,
  "SO count honors expiry before cron",
);
await rpc("expire_broker_reservations", []);
check(
  (await scalar("select status from broker_reservations where id=$1", [
    fLast.id,
  ])) === "expired",
  "Scheduler persists expired reservation",
);
await fail(
  () => as("broker1", () => rpc("broker_report", [])),
  /Active manager/,
);
await fail(
  () => as("broker1", () => rpc("staff_broker_case", [f.id])),
  /Not authorized/,
);
check(
  (await as("broker1", () => query("select * from broker_offers"))).rows
    .length === 0,
  "Raw broker offers deny all broker access",
);
check(
  (await as("broker1", () => query("select * from broker_reservations"))).rows
    .length === 0,
  "Raw reservations deny all broker access",
);
await query("update profiles set is_active=false where id=$1", [ids.so]);
await fail(
  () => act("so", f.id, "withdraw_consent", { reason: "Inactive SO" }),
  /Not authorized/,
);
await query("update profiles set is_active=true where id=$1", [ids.so]);
const draft = await as("so", () =>
  scalar(
    "insert into cases(branch_id,sales_officer_id) values($1,$2) returning id",
    [branches[0].id, ids.so],
  ),
);
await as("so", () =>
  query(
    "update cases set make='Toyota', customer_name='Draft customer' where id=$1",
    [draft],
  ),
);
check(
  (await scalar("select make from cases where id=$1", [draft])) === "Toyota",
  "Column grants preserve draft editing",
);
await fail(
  () =>
    as("so", () =>
      query("update cases set assigned_po_id=$1 where id=$2", [ids.so, draft]),
    ),
  /permission denied/,
);
check(
  (
    await as("pending", () =>
      query("update brokers set status='rejected' where id=$1 returning id", [
        ids.broker1,
      ]),
    )
  ).rows.length === 0,
  "Brokers cannot change account approval",
);
const rcCase = await newCase(0, "draft");
await query("update cases set vehicle_reg_number='TEST-RC-001',has_loan=false where id=$1", [rcCase.id]);
for (const category of ["front", "rear", "right", "interior_odometer", "other"]) {
  await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,$2,100,'image/jpeg',$3)", [rcCase.id, category, `test/${category}.jpg`]);
}
await fail(() => as("so", () => rpc("submit_case_for_evaluation", [rcCase.id])), /RC book photo is required/);
check(await scalar("select status from cases where id=$1", [rcCase.id]) === "draft", "Missing RC leaves the draft unchanged");
await fail(() => as("so", () => query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'application/pdf','test/rc.pdf',$2)", [rcCase.id, ids.so])), /rc_book_must_be_image/);
const rcPhoto = await as("so", () => scalar("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/rc.jpg',$2) returning id", [rcCase.id, ids.so]));
await fail(() => as("so", () => query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path,uploaded_by) values($1,'rc_book',100,'image/jpeg','test/duplicate.jpg',$2)", [rcCase.id, ids.so])), /one_rc_book_photo_per_case/);
await query("delete from case_photos where case_id=$1 and category='other'", [rcCase.id]);
await fail(() => as("so", () => rpc("submit_case_for_evaluation", [rcCase.id])), /6 vehicle photos/);
await query("insert into case_photos(case_id,category,file_size_bytes,mime_type,storage_path) values($1,'other',100,'image/jpeg','test/other.jpg')", [rcCase.id]);
await as("so", () => rpc("submit_case_for_evaluation", [rcCase.id]));
check(await scalar("select status from cases where id=$1", [rcCase.id]) === "pending_evaluation", "Six vehicle photos plus RC allow submission");
check((await as("po", () => query("select id from case_photos where id=$1", [rcPhoto]))).rows.length === 1, "Assigned PO can inspect RC");
check((await as("manager", () => query("select id from case_photos where id=$1", [rcPhoto]))).rows.length === 1, "Branch manager can inspect RC");
check((await as("otherSo", () => query("select id from case_photos where id=$1", [rcPhoto]))).rows.length === 0, "Other SO cannot inspect RC");
await as("po", () => rpc("start_po_evaluation", [rcCase.id]));
await as("po", () => rpc("submit_po_evaluation", [rcCase.id, true, "RC reviewed", 450000]));
await as("so", () => rpc("record_customer_decision", [rcCase.id, "rejected", true]));
await fail(() => as("so", () => rpc("review_broker_photo", [rcPhoto, true])), /rc_book_never_broker_visible/);
await as("so", () => rpc("review_broker_photo", [rcCase.photo, true]));
const rcMarket = JSON.stringify(await market("broker1", rcCase.id));
check(!rcMarket.includes(rcPhoto) && !rcMarket.includes("rc_book"), "Broker listing excludes RC metadata");
check((await as("broker1", () => query("select id from case_photos where id=$1", [rcPhoto]))).rows.length === 0, "Broker cannot read RC directly");
console.log(`${checks} broker workflow and access checks passed.`);
await db.close();
