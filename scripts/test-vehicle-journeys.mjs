// Live, persistent acceptance tests. Auth setup uses admin access; journeys use
// the UI and authenticated RPCs. Never changes existing users or backdates holds.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const mode = process.argv[2];
assert(["--preflight", "--run-live", "--verify-only"].includes(mode),
  "Use --preflight, --run-live (keeps synthetic records), or --verify-only.");
const run = process.env.QA_RUN_ID || "QA20261003A";
assert(/^QA[A-Z0-9]{4,20}$/.test(run), "QA_RUN_ID must start with QA and contain only uppercase letters/digits.");
const baseURL = process.env.QA_BASE_URL || "http://localhost:3000";
const output = resolve("test-results", run);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = (key = anon) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY);
const unwrap = ({ data, error }) => { assert.ifError(error); return data; };
const allProfiles = unwrap(await admin.from("profiles").select("id,employee_id,role,branch_id,is_active"));
const branches = unwrap(await admin.from("branches").select("id,code,name,cluster_id").order("display_order"));
if (mode === "--preflight") {
  const response = await fetch(`${baseURL}/login`);
  assert.equal(response.status, 200);
  console.log(JSON.stringify({ app: baseURL, branches: branches.map(b => ({ ...b,
    activePOs: allProfiles.filter(p => p.branch_id === b.id && p.role === "purchase_officer" && p.is_active).length,
  })) }, null, 2));
  process.exit(0);
}

await mkdir(output, { recursive: true, mode: 0o700 });
async function readJSON(name, fallback) {
  try { return JSON.parse(await readFile(resolve(output, name), "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}
const state = await readJSON("state.json", { run, steps: [], cases: {}, checks: [], startedAt: new Date().toISOString() });
const credentials = await readJSON("credentials.json", { password: randomBytes(18).toString("base64url"), accounts: {} });
async function save() {
  await writeFile(resolve(output, "state.json"), JSON.stringify(state, null, 2), { mode: 0o600 });
  await writeFile(resolve(output, "credentials.json"), JSON.stringify(credentials, null, 2), { mode: 0o600 });
}
function check(condition, description) {
  assert.ok(condition, description);
  if (!state.checks.some(c => c.description === description)) state.checks.push({ description, at: new Date().toISOString() });
  console.log(`PASS ${description}`);
}
async function step(name, fn) {
  if (state.steps.includes(name)) return;
  console.log(`RUN  ${name}`);
  await fn();
  state.steps.push(name);
  await save();
}
if (!state.branches) {
  const free = branches.filter(b => !allProfiles.some(p => p.branch_id === b.id && p.role === "purchase_officer" && p.is_active));
  const byCluster = new Map();
  for (const b of free) {
    if (!byCluster.has(b.cluster_id)) byCluster.set(b.cluster_id, []);
    byCluster.get(b.cluster_id).push(b);
  }
  // Need two free branches sharing a cluster (Cluster Manager scope tests) plus
  // a third free branch outside that cluster (to prove the scope has a limit).
  const sameCluster = [...byCluster.values()].find(list => list.length >= 2);
  assert(sameCluster, "Need two free branches sharing a cluster for Cluster Manager scope tests.");
  const outsideCluster = free.find(b => b.cluster_id !== sameCluster[0].cluster_id);
  assert(outsideCluster, "Need a third free branch in a different cluster for the Cluster Manager boundary test.");
  state.branches = [sameCluster[0], sameCluster[1], outsideCluster];
}
await save();
const definitions = {
  po: { role: "purchase_officer", branch: 0 },
  salesManager: { role: "sales_manager", branch: 0 },
  clusterManager: { role: "cluster_manager", cluster: true },
  admin: { role: "admin" },
  otherPo: { role: "purchase_officer", branch: 1 },
  otherSalesManager: { role: "sales_manager", branch: 1 },
  coordinator: { role: "broker_coordinator" },
  broker1: { role: "broker" }, broker2: { role: "broker" }, pending: { role: "broker" },
};
const actors = {};
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const playwrightTest = await import(process.env.PLAYWRIGHT_TEST_MODULE || "@playwright/test");
const expect = playwrightTest.expect.configure({ timeout: 20000 });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM || "/usr/bin/chromium-browser", args: ["--no-sandbox"] });
const errors = [];
async function navigate(page, path) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60000 });
  assert(response.status() < 500, `${path}: HTTP ${response.status()}`);
  await page.waitForLoadState("networkidle", { timeout: 60000 });
  await expect(page.locator("body")).not.toContainText("Application error");
}
async function login(key) {
  console.log(`LOGIN ${key}`);
  const account = credentials.accounts[key];
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, locale: "en-IN", timezoneId: "Asia/Kolkata" });
  const page = await context.newPage();
  actors[key].page = page;
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => errors.push({ actor: key, error: error.message, path: new URL(page.url()).pathname }));
  await navigate(page, "/login");
  if (account.role === "broker") await page.getByRole("button", { name: "broker", exact: true }).click();
  await page.locator("#employeeId").fill(account.employeeId || account.email);
  await page.locator("#password").fill(credentials.password);
  const authResponse = page.waitForResponse(r => r.url().includes("/auth/v1/token") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  assert((await authResponse).ok(), `${key}: password sign-in failed`);
  const rolePath = account.role === "broker" ? "broker" : account.role === "purchase_officer" ? "po" : account.role === "admin" ? "admin" : account.role === "broker_coordinator" ? "coordinator" : "manager";
  try {
    await page.waitForURL(`**/${rolePath}/dashboard`, { timeout: 60000, waitUntil: "domcontentloaded" });
  } catch (error) {
    throw new Error(`${key}: ${error.message}; URL ${page.url()}; page: ${(await page.locator("body").innerText()).slice(0, 2500)}`);
  }
  check(true, `${key}: login routes to /${rolePath}/dashboard`);
  return page;
}
async function rpc(key, name, args) { return actors[key].api.rpc(name, args); }
async function denied(key, name, args, pattern, description) {
  const { data, error } = await rpc(key, name, args);
  assert.match(error?.message || data?.error || "", pattern, description);
  check(true, description);
}
const action = (key, id, verb, payload = {}) => rpc(key, "broker_case_action", { p_case_id: id, p_action: verb, p_payload: payload });
async function uiRPC(page, name, click, errorPattern) {
  const responsePromise = page.waitForResponse(r => r.url().includes(`/rest/v1/rpc/${name}`) && r.request().method() === "POST", { timeout: 45000 });
  await click();
  const response = await responsePromise;
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  const message = body?.error || body?.message;
  if (errorPattern) assert.match(message || "", errorPattern);
  else { assert(response.ok(), JSON.stringify(body)); assert(!body?.error, JSON.stringify(body)); }
  return body;
}
const row = async id => unwrap(await admin.from("cases").select("*").eq("id", id).single());
async function status(id, expected) {
  await expect.poll(async () => (await row(id)).status, { timeout: 20000 }).toBe(expected);
  check(true, `${Object.values(state.cases).find(c => c.id === id)?.name || id}: database status ${expected}`);
}
const scenarios = [
  ["direct", "Direct purchase closed", "Innova", "closed"],
  ["broker", "Broker sale closed", "Glanza", "broker_deal_closed"],
  ["hold", "Competing selection and active 48h hold", "Fortuner", "broker_offer_selected"],
  ["release", "Release, rejection and reconfirmed bidding", "Urban Cruiser", "listed_for_brokers"],
  ["reject", "Customer declines broker listing", "Etios", "rejected_not_listed"],
  ["withdraw", "PO withdraws before customer decision", "Yaris", "withdrawn"],
  ["cancel", "Accepted direct purchase cancelled", "Camry", "cancelled"],
  ["consent", "Suspension and customer consent withdrawal", "Urban Cruiser Hyryder", "withdrawn"],
  ["decision", "Awaiting customer decision", "Rumion", "pending_customer_decision"],
  ["purchase", "Awaiting direct purchase completion", "Innova Crysta", "purchase_completion_pending"],
  ["draft", "Saved draft", "Glanza", "draft"],
].map(([key, name, model, expected], index) => ({ key, name, model, expected, index: index + 1,
  po: index % 2 ? "otherPo" : "po" }));
async function syntheticImage(page, vehicle, angle) {
  const base64 = await page.evaluate(({ vehicle, angle, run }) => {
    const c = document.createElement("canvas"); c.width = 1000; c.height = 650;
    const g = c.getContext("2d");
    g.fillStyle = "#f0f4f7"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#ac1930"; g.fillRect(0, 0, 1000, 100);
    g.font = "bold 36px sans-serif"; g.fillStyle = "#ffffff"; g.fillText("TEST FIXTURE - NOT A REAL VEHICLE", 32, 65);
    g.fillStyle = "#263d48"; g.font = "bold 34px sans-serif"; g.fillText(`Toyota ${vehicle}`, 35, 190);
    g.font = "28px sans-serif"; g.fillText(angle, 35, 245);
    if (angle === "Registration certificate") {
      g.strokeStyle = "#263d48"; g.strokeRect(35, 290, 920, 180);
      g.fillText("SYNTHETIC RC - NOT A VALID DOCUMENT", 65, 360);
    } else {
      g.fillStyle = "#327c82"; g.fillRect(140, 350, 680, 100);
      g.beginPath(); g.moveTo(255, 350); g.lineTo(355, 280); g.lineTo(600, 280); g.lineTo(695, 350); g.fill();
      g.fillStyle = "#233038";
      for (const x of [290, 670]) { g.beginPath(); g.arc(x, 453, 44, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = "#263d48"; g.font = "24px sans-serif"; g.fillText(run, 35, 565);
    g.fillText("Automated workflow verification only", 35, 608);
    return c.toDataURL("image/png").split(",")[1];
  }, { vehicle, angle, run });
  return { name: "test-fixture.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}
async function prepare(v) {
  const page = actors[v.po].page;
  if (!state.cases[v.key]) {
    await navigate(page, "/po/cases");
    await page.getByRole("button", { name: "New Case", exact: true }).click();
    await page.waitForURL(/\/po\/cases\/[0-9a-f-]{36}$/);
    state.cases[v.key] = { id: page.url().split("/").at(-1), name: v.name, expected: v.expected };
    await save();
  }
  const id = state.cases[v.key].id;
  await step(`${v.key}: draft, photos and prices`, async () => {
    await navigate(page, `/po/cases/${id}`);
    const values = {
      "SO handling this case": `${run} TEST SO ${v.index}`,
      "Customer name": `${run} TEST ONLY ${v.index} - ${v.name}`,
      "Customer mobile number": `90000000${String(v.index).padStart(2, "0")}`,
      "Vehicle registration number": `${run}${String(v.index).padStart(2, "0")}`,
      "Registration year": "2022", "Odometer reading (km)": String(18000 + v.index * 1000),
      "Ownership count": "1", "Customer expected price (INR)": String(700000 + v.index * 10000),
      "Nippon's offer price (INR)": String(600000 + v.index * 10000),
    };
    for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: false }).fill(value);
    await page.getByLabel("Make", { exact: false }).selectOption("Toyota");
    await page.getByLabel("Model", { exact: false }).selectOption(v.model);
    await page.getByLabel("Variant").fill(`${run} TEST ${v.index}`);
    await page.getByLabel("Fuel type").selectOption("petrol");
    await page.getByLabel("Transmission").selectOption("manual");
    await page.getByLabel("Loan / hypothecation status").selectOption("no");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    const existingPhotos = unwrap(await admin.from("case_photos").select("id,category").eq("case_id", id));
    if (existingPhotos.length < 7) await denied(v.po, "submit_case", { p_case_id: id }, /photo/i, `${v.key}: submission without required photos rejected`);
    for (const angle of ["Front", "Rear", "Left side", "Right side", "Interior / dashboard (odometer visible)", "Add photo", "Registration certificate"]) {
      const slot = page.locator("div.rounded-md").filter({ has: page.getByText(angle, { exact: true }) });
      if (await slot.getByRole("button", { name: "Remove", exact: true }).count()) continue;
      if (angle === "Add photo" && await page.getByText("Additional photos (1/5)", { exact: true }).count()) continue;
      await slot.locator('input[type="file"]').setInputFiles(await syntheticImage(page, v.model, angle));
      if (angle === "Add photo") await expect(page.getByText("Additional photos (1/5)", { exact: true })).toBeVisible();
      else await expect(slot.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    }
    const photos = unwrap(await admin.from("case_photos").select("id,category,storage_path,broker_visible,is_plate_visible").eq("case_id", id));
    check(photos.length === 7 && photos.some(p => p.category === "rc_book"), `${v.key}: six vehicle photos and private RC recorded`);
    check(photos.filter(p => p.broker_visible).length === 4, `${v.key}: the four non-plate vehicle photos are broker-visible automatically, no review step`);
    check(!photos.find(p => p.category === "rc_book").broker_visible, `${v.key}: RC book photo is never broker-visible`);
    state.cases[v.key].rcPhoto = photos.find(p => p.category === "rc_book").id;
    await page.reload();
    await expect(page.getByLabel("Customer name")).toHaveValue(values["Customer name"]);
    check(true, `${v.key}: draft survives browser reload`);
  });
  if (v.key === "draft") return;
  await step(`${v.key}: submit`, async () => {
    await navigate(page, `/po/cases/${id}`);
    if ((await row(id)).status === "draft") await uiRPC(page, "submit_case", () => page.getByRole("button", { name: "Submit Case", exact: true }).click());
    await status(id, "pending_customer_decision");
    const c = await row(id);
    assert.equal(c.po_id, actors[v.po].id);
    assert.equal(c.nippon_offer_price, 600000 + v.index * 10000);
    state.cases[v.key].reference = c.case_ref;
    check(true, `${v.key}: case reference generated and Nippon's offer stored on submission`);
  });
  if (["withdraw", "decision"].includes(v.key)) return;
  await step(`${v.key}: customer decision`, async () => {
    await navigate(page, `/po/cases/${id}`);
    const accept = ["direct", "cancel", "purchase"].includes(v.key);
    const expected = accept ? "purchase_completion_pending" : v.key === "reject" ? "rejected_not_listed" : "listed_for_brokers";
    if ((await row(id)).status === "pending_customer_decision") {
      await page.getByRole("button", { name: accept ? "Closed by UTrust" : "To Brokers", exact: true }).click();
      const name = accept ? "Yes, confirm" : v.key === "reject" ? "No, do not list" : "Yes, to brokers";
      await uiRPC(page, "record_customer_decision", () => page.getByRole("button", { name, exact: true }).click());
    }
    await status(id, expected);
  });
  if (!["broker", "hold", "release", "consent"].includes(v.key)) return;
  await step(`${v.key}: broker visibility`, async () => {
    const market = unwrap(await rpc("broker1", "broker_marketplace", { p_case_id: id }));
    check(market.total === 1 && market.items[0].photos.length === 4, `${v.key}: listing visible across branches with its four auto-visible photos`);
    const serialized = JSON.stringify(market);
    const c = await row(id);
    check(!serialized.includes(c.customer_name) && !serialized.includes(c.customer_mobile) && !serialized.includes('"customer_expected_price"') && !serialized.includes('"nippon_offer_price"') && !serialized.includes('"storage_path"') && !serialized.includes(state.cases[v.key].rcPhoto), `${v.key}: broker payload excludes customer, internal price and RC`);
  });
}
async function bid(key, v, amount) {
  const page = actors[key].page;
  const id = state.cases[v].id;
  await navigate(page, `/broker/vehicles/${id}`);
  await page.getByLabel("Offer price (INR)").fill(String(amount));
  await page.getByLabel("Note to SO").fill(`${run}: ${v} synthetic offer from ${key}`);
  await uiRPC(page, "broker_case_action", () => page.getByRole("button", { name: /^(Submit|Update|Reconfirm) offer$/ }).click());
  const offer = unwrap(await admin.from("broker_offers").select("*").eq("case_id", id).eq("broker_id", actors[key].id).single());
  assert.equal(offer.amount, amount);
  assert.equal(offer.status, "current");
  check(true, `${v}: ${key} bid ${amount} revision ${offer.revision} stored`);
  return offer;
}
const holdFor = async v => unwrap(await admin.from("broker_reservations").select("*").eq("case_id", state.cases[v].id).eq("status", "active").single());
async function selectBid(v, key, reason = "", errorPattern) {
  const page = actors.coordinator.page;
  await navigate(page, `/coordinator/cases/${state.cases[v].id}`);
  await page.getByLabel("Selection / release / withdrawal reason").fill(reason);
  const offerRow = page.getByRole("row").filter({ hasText: credentials.accounts[key].company });
  await uiRPC(page, "broker_case_action", () => offerRow.getByRole("button", { name: "Select for 48h", exact: true }).click(), errorPattern);
  if (errorPattern) {
    await expect(page.locator("main").getByRole("alert")).toContainText(errorPattern);
    return;
  }
  const hold = await holdFor(v);
  check(Date.parse(hold.expires_at) - Date.parse(hold.started_at) === 48 * 3600000, `${v}: exclusive hold lasts exactly 48 hours`);
  return hold;
}
async function staffAction(v, button, reason = "") {
  const page = actors.coordinator.page;
  await navigate(page, `/coordinator/cases/${state.cases[v].id}`);
  if (reason) await page.getByLabel("Selection / release / withdrawal reason").fill(`${run}: ${reason}`);
  await uiRPC(page, "broker_case_action", () => page.getByRole("button", { name: button, exact: true }).click());
}
async function adminAction(key, verb, reason) {
  const page = actors.admin.page;
  const b = unwrap(await admin.from("brokers").select("status,suspended_at").eq("id", actors[key].id).single());
  await navigate(page, `/admin/brokers?status=${b.suspended_at ? "suspended" : b.status}`);
  const article = page.getByRole("article").filter({ hasText: credentials.accounts[key].email });
  await article.getByLabel("Decision reason").fill(`${run}: ${reason}`);
  await uiRPC(page, "manage_broker", () => article.getByRole("button", { name: verb, exact: true }).click());
}

const SELF_SIGNUP_ROLES = new Set(["purchase_officer"]);
try {
  for (const [key, def] of Object.entries(definitions)) {
    const { role } = def;
    if (!credentials.accounts[key]) {
      assert.equal(mode, "--run-live", "Run --run-live to create the test fixture first.");
      const employeeId = role === "broker" ? undefined : `${run}${key.toUpperCase()}`;
      const email = role === "broker" ? `${run.toLowerCase()}-${key.toLowerCase()}@example.test` : `${employeeId.toLowerCase()}@staff.utrustpoc.com`;
      credentials.accounts[key] = { role, employeeId, email, company: `${run} TEST ${key}` };
      await save();
    }
    const account = credentials.accounts[key];
    await step(`account: ${key}`, async () => {
      assert.equal(mode, "--run-live");
      if (!account.id) {
        const user = unwrap(await admin.auth.admin.createUser({ email: account.email, password: credentials.password, email_confirm: true, user_metadata: { qa_run: run } }));
        account.id = user.user.id;
        await save();
      }
      const api = client();
      unwrap(await api.auth.signInWithPassword({ email: account.email, password: credentials.password }));
      if (role === "broker") {
        unwrap(await api.from("brokers").insert({ id: account.id, company_name: account.company, contact_name: `${run} TEST CONTACT`, phone: "9000000000", email: account.email }));
      } else {
        // Procurement Officer can self-insert their own profile; every other
        // role (Manager family, Admin, Broker Coordinator) is owner-provisioned
        // only, so it needs the service-role client, same as seed-manager.mjs.
        const scope = def.cluster ? { cluster_id: state.branches[0].cluster_id } : def.branch !== undefined ? { branch_id: state.branches[def.branch].id } : {};
        unwrap(await (SELF_SIGNUP_ROLES.has(role) ? api : admin).from("profiles").insert({ id: account.id, employee_id: account.employeeId, full_name: `${run} TEST ${key}`, role, ...scope }));
      }
    });
    const api = client();
    unwrap(await api.auth.signInWithPassword({ email: account.email, password: credentials.password }));
    actors[key] = { id: account.id, api };
  }
  for (const key of ["po", "salesManager", "clusterManager", "admin", "coordinator", "otherPo", "otherSalesManager"]) await login(key);
  if (mode === "--run-live") {
    await step("broker approvals and admin/manager scope", async () => {
      await denied("pending", "broker_marketplace", {}, /Approved broker/i, "Pending broker cannot browse");
      await denied("salesManager", "manage_broker", { p_broker_id: actors.broker1.id, p_action: "approve", p_reason: "Test" }, /Active admin required/i, "Sales Manager cannot approve broker accounts");
      await denied("clusterManager", "manage_broker", { p_broker_id: actors.broker1.id, p_action: "approve", p_reason: "Test" }, /Active admin required/i, "Cluster Manager cannot approve broker accounts");
      for (const key of ["broker1", "broker2"]) {
        const b = unwrap(await admin.from("brokers").select("status").eq("id", actors[key].id).single());
        if (b.status === "pending") await adminAction(key, "approve", "Verified synthetic broker for workflow test");
      }
      await adminAction("pending", "reject", "Synthetic rejected application coverage");
      await denied("pending", "broker_marketplace", {}, /Approved broker/i, "Rejected broker cannot browse");
    });
  }
  for (const key of ["broker1", "broker2"]) await login(key);
  if (mode === "--run-live") {
    for (const v of scenarios) await prepare(v);
    await step("direct: close", async () => {
      const id = state.cases.direct.id;
      const page = actors.po.page;
      await navigate(page, `/po/cases/${id}`);
      await page.getByRole("button", { name: "Mark as Closed", exact: true }).click();
      await uiRPC(page, "close_case", () => page.getByRole("button", { name: "Yes, close it", exact: true }).click());
      await status(id, "closed");
      await denied("po", "close_case", { p_case_id: id }, /not awaiting completion/i, "Direct purchase cannot close twice");
    });
    await step("withdraw: reason recorded", async () => {
      const page = actors.otherPo.page;
      await navigate(page, `/po/cases/${state.cases.withdraw.id}`);
      await page.getByRole("button", { name: "Withdraw this case", exact: true }).click();
      await page.locator("textarea").fill(`${run}: synthetic customer withdrew before a decision was recorded`);
      await uiRPC(page, "withdraw_case", () => page.getByRole("button", { name: "Confirm withdrawal", exact: true }).click());
    });
    await step("cancel: reason recorded", async () => {
      const page = actors.po.page;
      await navigate(page, `/po/cases/${state.cases.cancel.id}`);
      await page.getByRole("button", { name: "Cancel Deal", exact: true }).click();
      await page.locator("textarea").fill(`${run}: synthetic purchase cancelled before payment`);
      await uiRPC(page, "cancel_case", () => page.getByRole("button", { name: "Confirm cancellation", exact: true }).click());
    });
    await step("broker: competing bids and stale revisions", async () => {
      const low = await bid("broker1", "broker", 650000);
      await bid("broker2", "broker", 670000);
      await denied("broker1", "broker_case_action", { p_case_id: state.cases.broker.id, p_action: "offer", p_payload: { amount: 680000, revision: low.revision - 1 } }, /offer changed/i, "Stale bid cannot overwrite current offer");
      const market = unwrap(await rpc("broker1", "broker_marketplace", { p_case_id: state.cases.broker.id }));
      check(!JSON.stringify(market).includes("670000") && !JSON.stringify(market).includes(actors.broker2.id), "Competing broker amount and identity remain private");
      await selectBid("broker", "broker1", "", /reason for selecting a lower offer/i);
      await selectBid("broker", "broker1", `${run}: lower synthetic offer selected to test documented exception`);
    });
    await step("broker: lock guards and completion", async () => {
      const id = state.cases.broker.id;
      const hold = await holdFor("broker");
      await denied("broker2", "broker_case_action", { p_case_id: id, p_action: "offer", p_payload: { amount: 690000, revision: 1 } }, /not open/i, "Bidding blocked while another broker holds the vehicle");
      await denied("broker2", "broker_case_action", { p_case_id: id, p_action: "release", p_payload: { reservation_id: hold.id, reason: "Not my hold" } }, /Not authorized/i, "A competing broker cannot release the lock");
      await denied("otherPo", "broker_case_action", { p_case_id: id, p_action: "complete", p_payload: { reservation_id: hold.id, payment_complete: true, handover_complete: true } }, /Not authorized/i, "PO (even the case owner) cannot complete a broker deal");
      await denied("coordinator", "broker_case_action", { p_case_id: id, p_action: "complete", p_payload: { reservation_id: hold.id, payment_complete: true, handover_complete: true } }, /acceptance/i, "Broker completion requires customer acceptance");
      await staffAction("broker", "Customer accepted");
      assert.equal((await holdFor("broker")).expires_at, hold.expires_at);
      check(true, "Customer acceptance does not extend the hold");
      const page = actors.coordinator.page;
      await navigate(page, `/coordinator/cases/${id}`);
      await expect(page.getByRole("button", { name: "Complete broker deal", exact: true })).toBeDisabled();
      await page.getByLabel("Payment completed", { exact: true }).check();
      await expect(page.getByRole("button", { name: "Complete broker deal", exact: true })).toBeDisabled();
      await page.getByLabel("Vehicle handover completed", { exact: true }).check();
      await uiRPC(page, "broker_case_action", () => page.getByRole("button", { name: "Complete broker deal", exact: true }).click());
      await status(id, "broker_deal_closed");
      await denied("coordinator", "broker_case_action", { p_case_id: id, p_action: "complete", p_payload: { reservation_id: hold.id, payment_complete: true, handover_complete: true } }, /ended or changed/i, "Broker completion cannot be duplicated");
    });
    await step("release: reject, release, withdraw and reconfirm", async () => {
      await bid("broker1", "release", 640000);
      await bid("broker2", "release", 655000);
      await selectBid("release", "broker2");
      const page = actors.broker2.page;
      await navigate(page, `/broker/vehicles/${state.cases.release.id}`);
      await page.getByLabel("Reason for releasing your reservation").fill(`${run}: synthetic transporter unavailable`);
      await uiRPC(page, "broker_case_action", () => page.getByRole("button", { name: "Release reservation", exact: true }).click());
      const offers = unwrap(await admin.from("broker_offers").select("status").eq("case_id", state.cases.release.id));
      check(offers.every(o => o.status === "reconfirm"), "Releasing lock requires all previous bids to be reconfirmed");
      await bid("broker1", "release", 660000);
      await selectBid("release", "broker1");
      await staffAction("release", "Customer rejected", "synthetic customer rejected broker price");
      await bid("broker2", "release", 665000);
      await selectBid("release", "broker2");
      await staffAction("release", "Release reservation", "Coordinator releases synthetic hold for corrected paperwork");
      await bid("broker1", "release", 668000);
      const b1 = actors.broker1.page;
      await uiRPC(b1, "broker_case_action", () => b1.getByRole("button", { name: "Withdraw offer", exact: true }).click());
      await bid("broker1", "release", 670000);
      await bid("broker2", "release", 675000);
    });
    await step("consent: suspension releases lock; reactivation and delisting", async () => {
      await bid("broker2", "consent", 685000);
      const hold = await selectBid("consent", "broker2");
      await adminAction("broker2", "suspend", "Synthetic suspension during active reservation");
      await denied("broker2", "broker_marketplace", {}, /Approved broker/i, "Suspended broker loses marketplace access");
      const ended = unwrap(await admin.from("broker_reservations").select("status").eq("id", hold.id).single());
      check(ended.status === "released", "Suspension releases the broker's active hold");
      await adminAction("broker2", "reactivate", "Synthetic suspension check complete");
      const offers = unwrap(await admin.from("broker_offers").select("status").eq("case_id", state.cases.consent.id));
      check(offers.every(o => o.status === "withdrawn"), "Reactivation does not resurrect old bids");
      await bid("broker2", "consent", 690000);
      await selectBid("consent", "broker2");
      await staffAction("consent", "Withdraw customer consent and delist", "Synthetic customer revoked broker consent");
      const market = unwrap(await rpc("broker1", "broker_marketplace", { p_case_id: state.cases.consent.id }));
      check(market.total === 0, "Consent withdrawal delists the vehicle");
    });
    await step("hold: concurrent requests and retained active reservation", async () => {
      const first = await bid("broker1", "hold", 800000);
      const second = await bid("broker2", "hold", 820000);
      const id = state.cases.hold.id;
      const results = await Promise.all([first, second].map(o => action("coordinator", id, "select", { offer_id: o.id, revision: o.revision, reason: `${run}: concurrent selection test` })));
      check(results.filter(r => !r.error && r.data?.ok).length === 1 && results.filter(r => r.data?.error).length === 1, "Concurrent live selection requests produce exactly one successful lock");
      const holds = unwrap(await admin.from("broker_reservations").select("*").eq("case_id", id).eq("status", "active"));
      check(holds.length === 1, "Database contains exactly one active reservation for competing selections");
      check(Date.parse(holds[0].expires_at) - Date.parse(holds[0].started_at) === 48 * 3600000, "Retained live hold lasts 48 hours");
      state.cases.hold.expiresAt = holds[0].expires_at;
      state.cases.hold.selectedBroker = holds[0].broker_id === actors.broker1.id ? "broker1" : "broker2";
      await staffAction("hold", "Customer accepted");
    });
  }

  for (const v of scenarios) {
    const c = state.cases[v.key];
    assert(c, `Missing scenario ${v.key}`);
    const actual = await row(c.id);
    // Retained holds can legitimately expire after the original run.
    const elapsed = v.key === "hold" && Date.parse(c.expiresAt) <= Date.now();
    check(actual.status === v.expected || (elapsed && actual.status === "listed_for_brokers"), `${v.key}: final persisted status ${actual.status}`);
    c.status = actual.status;
    c.reference = actual.case_ref;
    c.managerURL = `${baseURL}/manager/cases/${c.id}`;
    const events = unwrap(await admin.from("case_events").select("event_type,actor_id,actor_role,metadata,notes,created_at").eq("case_id", c.id).order("created_at"));
    c.events = events;
    if (v.key !== "draft") check(events.some(e => e.event_type === "case_submitted"), `${v.key}: submission audit persisted`);
    const expectedEvents = {
      direct: ["case_submitted", "customer_decision_recorded", "case_closed"],
      broker: ["case_submitted", "listed_for_brokers", "broker_offer", "broker_offer_selected", "broker_accept", "broker_complete"],
      hold: ["listed_for_brokers", "broker_offer", "broker_offer_selected", "broker_accept"],
      release: ["broker_offer", "broker_offer_selected", "broker_release", "broker_reject", "broker_withdraw_offer"],
      reject: ["case_submitted", "customer_decision_recorded"],
      withdraw: ["case_withdrawn"], cancel: ["customer_decision_recorded", "case_cancelled"],
      consent: ["broker_offer_selected", "broker_consent_withdrawn"],
      decision: ["case_submitted"], purchase: ["case_submitted", "customer_decision_recorded"],
    };
    for (const type of expectedEvents[v.key] || []) {
      assert(events.some(e => e.event_type === type && e.actor_id && e.actor_role), `${v.key}: missing ${type} actor/audit`);
    }
    check(true, `${v.key}: expected journey events and acting roles persisted`);
    await navigate(actors.clusterManager.page, `/manager/cases/${c.id}`);
    await expect(actors.clusterManager.page.getByText(`${run} TEST ONLY ${v.index} - ${v.name}`, { exact: true })).toBeVisible();
    await expect(actors.clusterManager.page.getByRole("heading", { name: "Activity Log", exact: true })).toBeVisible();
    await expect.poll(() => actors.clusterManager.page.locator("main img:visible").evaluateAll(images =>
      images.length === 7 && images.every(img => img.complete && img.naturalWidth > 0)), { timeout: 20000 }).toBe(true);
    check(true, `${v.key}: all seven stored images render in manager UI`);
    const activity = actors.clusterManager.page.getByRole("region", { name: "Activity Log", exact: true });
    for (const role of new Set(events.map(e => e.actor_role).filter(Boolean))) {
      await expect(activity.getByText(role.replaceAll("_", " "), { exact: true }).first()).toBeVisible();
    }
    for (const event of events) {
      if (event.notes) await expect(activity.getByText(event.notes, { exact: true }).first()).toBeVisible();
    }
    await actors.clusterManager.page.screenshot({ path: resolve(output, `${v.key}-manager.png`), fullPage: true });
    check(true, `${v.key}: manager detail and activity log render`);
  }
  console.log("VERIFY access boundaries and real photo downloads");
  {
    const id = state.cases.hold.id;
    const wrongPO = unwrap(await actors.otherPo.api.from("cases").select("id").eq("id", id));
    check(wrongPO.length === 0, "A PO who doesn't own the case cannot read it");
    const wrongSalesManager = unwrap(await actors.otherSalesManager.api.from("cases").select("id").eq("id", id));
    check(wrongSalesManager.length === 0, "Sales Manager cannot read another branch's case");
    for (const table of ["cases", "case_photos", "broker_offers", "broker_reservations"]) {
      check(unwrap(await actors.broker1.api.from(table).select("id")).length === 0, `Broker cannot read raw ${table}`);
    }
    await denied("otherPo", "broker_case_action", { p_case_id: id, p_action: "withdraw_consent", p_payload: { reason: "Wrong owner" } }, /Not authorized/i, "A PO who doesn't own the case cannot change its broker workflow");
    await denied("po", "broker_case_action", { p_case_id: id, p_action: "withdraw_consent", p_payload: { reason: "Case owner no longer has write access" } }, /Not authorized/i, "PO (even the case owner) cannot change broker workflow -- that's Broker Coordinator's job");
    await denied("broker1", "broker_report", {}, /Active cluster manager/i, "Broker cannot read manager reports");
    const rc = state.cases.hold.rcPhoto;
    for (const [key, expected] of [["broker1", 403], ["otherPo", 403], ["otherSalesManager", 403], ["po", 200], ["salesManager", 200], ["coordinator", 200]]) {
      const res = await actors[key].page.request.get(`/api/photos/${rc}/signed-url`);
      check(res.status() === expected, `${key}: RC endpoint returns ${expected}`);
      if (expected === 200) {
        const signed = await res.json();
        const image = await actors[key].page.request.get(signed.url);
        check(image.ok() && image.headers()["content-type"].startsWith("image/"), `${key}: private RC file loads from storage`);
      }
    }
    const market = unwrap(await rpc("broker1", "broker_marketplace", { p_case_id: state.cases.release.id }));
    const photo = market.items[0].photos[0].id;
    const response = await actors.broker1.page.request.get(`/api/photos/${photo}/signed-url`);
    assert.equal(response.status(), 200);
    const image = await actors.broker1.page.request.get((await response.json()).url);
    check(image.ok(), "Broker can load the approved vehicle image from storage");
  }
  const clusterReport = unwrap(await rpc("clusterManager", "broker_report", {}));
  const adminEvents = unwrap(await admin.from("broker_admin_events").select("broker_id,actor_id,action,reason,created_at")
    .in("broker_id", [actors.broker1.id, actors.broker2.id, actors.pending.id]).order("created_at"));
  for (const [key, verb] of [["broker1", "approve"], ["broker2", "approve"], ["pending", "reject"], ["broker2", "suspend"], ["broker2", "reactivate"]]) {
    check(adminEvents.some(e => e.broker_id === actors[key].id && e.actor_id === actors.admin.id && e.action === verb && e.reason.startsWith(run)), `${key}: ${verb} audit contains the admin's id and reason`);
  }
  await denied("salesManager", "broker_report", {}, /Active cluster manager/i, "Sales Manager has no broker_report access at all");
  check(clusterReport.cases.some(c => c.id === state.cases.broker.id), "Cluster Manager report includes a sale from another branch in the same cluster");
  const completed = unwrap(await admin.from("broker_reservations").select("*").eq("case_id", state.cases.broker.id).eq("status", "completed"));
  check(completed.length === 1 && completed[0].amount === 650000 && completed[0].payment_complete && completed[0].handover_complete, "Completed sale has one price snapshot with payment and handover recorded");
  const ownReport = unwrap(await rpc("clusterManager", "broker_report", { p_broker: actors.broker1.id }));
  check(ownReport.completed === 1 && ownReport.deal_value === 650000, "Cluster Manager broker filter counts completed test sale once at INR 650000");
  if (Date.parse(state.cases.hold.expiresAt) > Date.now()) {
    for (const key of ["broker1", "broker2"]) {
      const page = actors[key].page;
      await navigate(page, `/broker/vehicles/${state.cases.hold.id}`);
      await expect(page.getByText("Offers are paused during this reservation.", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Offer price (INR)")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Release reservation", exact: true })).toHaveCount(key === state.cases.hold.selectedBroker ? 1 : 0);
      await page.screenshot({ path: resolve(output, `${key}-active-hold.png`), fullPage: true });
      check(true, `${key}: active lock pauses bidding and limits release to its owner in UI`);
    }
  }
  for (const [key, paths] of [
    ["clusterManager", ["/manager/dashboard", "/manager/marketplace", `/manager/cases?q=${run}`]],
    ["admin", ["/admin/dashboard", "/admin/users", "/admin/brokers?status=approved"]],
    ["salesManager", ["/manager/dashboard", `/manager/cases?q=${run}`]],
    ["coordinator", ["/coordinator/cases", `/coordinator/cases/${state.cases.hold.id}`]],
    ["po", ["/po/dashboard", "/po/cases"]], ["otherPo", ["/po/dashboard", "/po/cases"]],
    ["broker1", ["/broker/dashboard", "/broker/offers", "/broker/reservations", "/broker/history"]],
    ["broker2", ["/broker/dashboard", "/broker/offers", "/broker/reservations", "/broker/history"]],
  ]) {
    for (const path of paths) {
      const page = actors[key].page;
      await navigate(page, path);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/Could not load|schema cache|approved broker required/i);
      check(true, `${key}: ${path} loads without application errors`);
    }
  }
  const clusterManagerPage = actors.clusterManager.page;
  await login("pending");
  await expect(actors.pending.page.getByRole("heading", { name: "Application not approved", exact: true })).toBeVisible();
  check(true, "Rejected broker login shows restricted account screen");
  await navigate(clusterManagerPage, `/manager/cases?q=${run}`);
  await expect(clusterManagerPage.locator("tbody tr")).toHaveCount(scenarios.length);
  await clusterManagerPage.screenshot({ path: resolve(output, "all-vehicles-desktop.png"), fullPage: true });
  await clusterManagerPage.setViewportSize({ width: 390, height: 844 });
  await clusterManagerPage.screenshot({ path: resolve(output, "all-vehicles-mobile.png"), fullPage: true });
  check(await clusterManagerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Manager case list fits mobile viewport");
  await actors.broker1.page.setViewportSize({ width: 390, height: 844 });
  await navigate(actors.broker1.page, `/broker/vehicles/${state.cases.release.id}`);
  await actors.broker1.page.screenshot({ path: resolve(output, "broker-bidding-mobile.png"), fullPage: true });
  check(await actors.broker1.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Broker bidding fits mobile viewport");
  check(errors.length === 0, `No browser exceptions (${errors.length})`);
  state.completedAt = new Date().toISOString();
  state.result = "passed";
  delete state.failure;
  await save();
  await writeFile(resolve(output, "report.json"), JSON.stringify({ run, result: state.result, startedAt: state.startedAt, completedAt: state.completedAt, checks: state.checks, cases: state.cases, brokerAdminEvents: adminEvents }, null, 2));
  console.log(`\n${state.checks.length} checks passed. ${scenarios.length} persistent vehicles. Report: ${output}/report.json`);
  console.log(`Review: ${baseURL}/manager/cases?q=${run}`);
} catch (error) {
  state.result = "failed";
  state.failure = error.message;
  await save();
  for (const [key, actor] of Object.entries(actors)) {
    if (actor.page && !actor.page.isClosed()) await actor.page.screenshot({ path: resolve(output, `failure-${key}.png`), fullPage: true, timeout: 10000 }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
