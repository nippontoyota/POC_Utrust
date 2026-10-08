This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Broker Marketplace Setup

1. Apply migrations in numeric order through `supabase/migrations/0033_rename_cases_po_id_fkey.sql` using the Supabase SQL editor or migration runner before deploying the updated app. Migration `0015` makes variant optional; `0016` makes customer expected price optional and adds the vehicle colour column and its draft-editing permission; `0017` adds the customer counter-offer fields; `0018`-`0021` add the Sales Manager / Cluster Manager / PO Manager roles; `0022`-`0023` add the Admin role; `0024` removes the original `manager` role entirely; `0026` adds vehicle registration year/number limits; `0027`-`0029` added (and then superseded) the Broker Coordinator role; `0031`-`0033` remove the Sales Officer role entirely and merge intake, evaluation, and the customer-decision step into one Procurement Officer workflow (see "Procurement Officer Role" and "Broker Coordinator Role" below).
2. Enable Supabase Cron (`pg_cron`) and execute `supabase/setup-broker-cron.sql` as the database owner. It schedules expiry every minute and is safe to rerun.
3. An **Admin** approves applications under **Brokers**. Managers have read-only Broker Performance reporting only (Cluster Manager, since `0024`) and cannot approve, reject, or suspend brokers. Staff sign in with Employee ID; brokers use the Broker login tab and email/password. Broker IDs are reference numbers, not credentials.
4. Photos no longer go through a manual review step: any uploaded photo that isn't registration-plate-visible becomes visible to brokers automatically the instant a case is actually listed (see "Broker Workflow and Access" below). Broker Coordinator keeps selecting the winning offer and closing the deal.
5. Verify one complete flow with PO, broker, Sales Manager, Cluster Manager, and Broker Coordinator accounts in your deployment environment. The isolated test suite below does not apply migrations or create users in your connected Supabase project.

Required `.env.local` entries: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. If Turbopack cannot start its worker, use `npm run dev -- --webpack` and `npm run build -- --webpack`.

Vehicle colour suggestions are keyed by make and model in `src/lib/vehicleColors.ts`, with the official source beside each palette. They cover selected model-year palettes, not every historical trim; unlisted models or shades use **Other** for manual entry. Changing make or model clears the previous colour. Both variant and customer expected price may be left blank.

Check the scheduler with:

```sql
select jobname, schedule, active from cron.job
where jobname = 'expire-broker-reservations';
select status, return_message, start_time from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'expire-broker-reservations')
order by start_time desc limit 10;
```

## Manager Sub-Types

There is no generic `manager` role — it was removed in migration `0024` once these three covered everything it did. No profile ever had `role = 'manager'` at the time of removal, so this was a clean cutover with no data to migrate:

- **Sales Manager** (`sales_manager`) — one branch, full case detail (customer info, SO work, PO price/notes, broker status) for that branch only.
- **Cluster Manager** (`cluster_manager`) — every branch in one cluster, same full detail, just wider. `clusters` is a new table; every branch belongs to exactly one cluster (`branches.cluster_id`). Cluster Manager is also the only one of the three with read-only **Broker Performance** reporting (`/manager/marketplace`, backed by `broker_report()`, scoped to that manager's own cluster) — the old `manager` role's one exclusive capability, moved here rather than dropped.
- **PO Manager** (`po_manager`) — one company-wide account overseeing every Purchase Officer. Sees assigned PO, inspection status, offer price, and turnaround for every case, across every branch, but **never** the customer's name or mobile number. Enforced at the database level: `po_manager` is deliberately excluded from the `cases`/`profiles` row-level security policies and can only read case data through three purpose-built functions (`po_manager_summary`, `po_manager_cases`, `po_manager_case`) that never select those two columns. It does have normal read access to `case_photos`/`case_offers`/`case_events`, none of which contain customer contact info.

None of the three get any write/action capability anywhere.

All three are owner-provisioned only via `scripts/seed-manager.mjs`:

```bash
node scripts/seed-manager.mjs sales_manager <employeeId> <fullName> <branchCode> <password>
node scripts/seed-manager.mjs cluster_manager <employeeId> <fullName> <clusterName> <password>
node scripts/seed-manager.mjs po_manager <employeeId> <fullName> <password>
```

The `/manager/*` pages are shared across all three manager sub-types — the database scopes what each one sees automatically via row-level security, so there is no separate page tree per role. `po_manager`'s pages take a different, RPC-based data path (see above) since it's the one role that needs column-level restriction, not just row-level.

## Admin Role

A separate `admin` role (`/admin/*`) owns account and broker administration, strictly apart from case/business data (which stays with the Manager family):

- **Users** (`/admin/users`) — every staff account (SO, PO, and the whole Manager family). Admin can create new accounts, edit an existing one (including reassigning role/branch/cluster), activate/deactivate, and reset a password. There is no hard delete — deactivating keeps the account's case/offer history intact and attributed to them, matching how the rest of the system treats history. An admin cannot deactivate their own account.
- **Brokers** (`/admin/brokers`) — approve, reject, suspend, and reactivate broker applications (moved here from the Manager role's old `is_group_manager`-gated "Broker Access" screen, which no longer exists — `is_group_manager` itself was dropped from `profiles` in `0024`, along with the role it existed for). Managers keep read-only Broker Performance reporting only (Cluster Manager, as of `0024`).
- **Dashboard** (`/admin/dashboard`) — staff counts by role, active/inactive counts, broker counts by status. No case or customer data appears anywhere under `/admin`.

Two different implementation paths, worth knowing about:

- Activate/deactivate, role reassignment, and broker approve/reject/suspend/reactivate are Postgres functions (`admin_set_profile_active`, `admin_reassign_profile`, `manage_broker`) callable straight from the browser, same as everywhere else in this app — each checks `is_active_admin()` itself.
- Creating an account and resetting a password need Supabase's Auth Admin API (to actually create a login or change its password), which requires the service-role key and can never reach the browser. Those two go through Next.js Server Actions (`src/lib/actions/admin.ts`) that re-verify the caller is an active admin using their own normal session, then use the existing `createServiceClient()` helper (`src/lib/supabase/service.ts`) — already used by the CLI seed script — to perform the privileged operation server-side.

Every admin action is logged to `admin_events` (actor, action, target, metadata), mirroring `broker_admin_events`/`case_events` elsewhere in the schema.

Provisioning is owner-only, same as the rest of the Manager family:

```bash
node scripts/seed-manager.mjs admin <employeeId> <fullName> <password>
```

From there, that Admin account can create every other account (including additional Admins) through the UI.

## Procurement Officer Role

The Sales Officer role was removed entirely in `0031`. A single **Procurement Officer** (`purchase_officer`, labelled "Procurement Officer" in the UI, `/po/*`) now owns a case end to end:

- Creates the case in one combined form — customer and vehicle details, vehicle photos plus a required RC book photo, **who's handling it in the field** (`so_name`, a free-text note — there's no SO account behind it anymore), the customer's expected price, and Nippon's offer price, all at once.
- The case stays editable (including photos) for as long as it's in `draft` or `pending_customer_decision` — there's no draft-then-lock handoff to a second role. Clicking **Submit Case** (`submit_case`) validates every required field plus the photo set (RC book + at least 6 vehicle photos) and moves the case straight to `pending_customer_decision` — no round-robin assignment, no separate evaluation phase.
- Records the customer's decision themselves: **Closed by UTrust** (accept) or **To Brokers** (reject, with a separate yes/no for broker-listing consent — rejecting without consent ends at `rejected_not_listed`).
- Keeps Cancel (after an accepted deal falls through) and Withdraw (before a decision is recorded), same mechanics as before, just under one role.

Self-registration (`/signup`) only ever creates `purchase_officer` accounts now.

## Broker Coordinator Role

A separate `broker_coordinator` role (`/coordinator/*`) owns the broker-marketplace workflow for any case that has been rejected and listed. Company-wide scope, like PO Manager and Admin — one account (or more) covers every branch.

As of `0031`, Broker Coordinator no longer gates whether a case gets listed, and no longer manually reviews photos — both of those happened automatically the moment the PO records "reject + consent to brokers" (see "Broker Workflow and Access" below). What Broker Coordinator still owns, unchanged: **selecting which broker's offer to go with, recording the customer's decision on that broker's price, confirming payment/handover to close the deal, releasing holds, and withdrawing consent.** The owning PO's case page shows the same Broker Marketplace panel read-only, so they can still track progress on a case they created.

This is enforced in the database, not just the UI: the staff side of `broker_case_action()` (`select`, `withdraw_consent`, and the `accept`/`reject`/`release`/`complete` branch) requires an active `broker_coordinator`, not the case's owning PO. Read access to a case (`cases`, `case_photos`, `case_events`) is granted once `broker_consent` is true, via the same `manager_case_access()` function the Manager family and PO Manager use.

Provisioning is through the Admin UI, same as every other manager-family role, or via script:

```bash
node scripts/seed-manager.mjs broker_coordinator <employeeId> <fullName> <password>
```

## Broker Workflow and Access

- The owning PO uploads 6-10 vehicle photos plus a required RC book photo (one image, maximum 5MB) as part of the combined case form. The RC image does not count toward the vehicle-photo minimum or limit and is never available to brokers.
- The moment a photo is uploaded, it's automatically tagged broker-visible unless it's plate-visible (front/rear) or the RC book — no manual review step exists anymore. It only actually becomes reachable by a broker once the case reaches `listed_for_brokers`/`broker_offer_selected` with consent, same access gating as always.
- Customer acceptance of Nippon's offer follows the existing direct-purchase completion flow (now "Closed by UTrust"). Rejection plus consent lists the case immediately — no Broker Coordinator approval gate (see "Broker Coordinator Role" above).
- Brokers see one undifferentiated **reference price** per listing — the customer's expected price plus ₹10,000, never broken down or labelled as derived from the customer's price. It's informational only, not an enforced minimum bid.
- Approved, unsuspended brokers browse across branches and submit private offers. They receive their own amount/history, vehicle specifications, location, the reference price, auto-visible photos, and availability. Customer contacts, the raw expected price, Nippon's offer, competing offers, and raw cases/events remain private.
- Broker Coordinator selects an offer, with a reason required for choosing a lower price. Selection snapshots the amount and starts an exclusive 48 elapsed hours, including weekends. Offers are frozen during the hold.
- Customer acceptance belongs to the reservation and does not extend it. Broker Coordinator confirms payment and handover before the deadline to close the broker deal.
- Rejection, release, or expiry reopens bidding and requires earlier current/selected offers to be reconfirmed. Customer consent withdrawal delists the case. Suspension denies access, withdraws offers, and releases active holds; reactivation never resurrects them.
- Sales Managers inspect their own branch's history; Cluster Managers see every branch in their cluster, including broker performance reporting. Account decisions and case actions have database audit records.

`broker_offers` keeps one current record per broker/case, with revisions recorded in `case_events`. `broker_reservations` keeps every price snapshot and outcome. Protected writes use RPCs; clients cannot directly update workflow tables or privileged metadata. `broker_marketplace` returns an explicit field allowlist instead of exposing `cases` to brokers.

Mutations validate database time, lock the case, and settle expiry before acting. Reads project an elapsed hold as expired even when Cron is delayed. Business conflicts return an error result instead of rolling back a settled expiry. A partial unique index prevents multiple active holds. Marketplace writes use one advisory transaction lock for this POC; ordered finer-grained locks are the upgrade path if write volume warrants it.

No hold extensions, automatic winning bids, deposits, commissions, payment processing, or external messages are included. Listings do not expire automatically. Signed photo links already issued may remain usable for up to five minutes after access revocation.

## Reporting Definitions

- Live listings, no-current-offer cases, active holds, and holds expiring within two hours are current inventory measures, independent of date filters.
- Completed deals and broker deal value use completion date. Reservation performance and release reasons use attempts started in the selected period.
- Listing cohort conversion is eventually completed broker cases divided by cases first listed in the selected period. It counts a case once despite multiple attempts. Broker-filtered cohorts contain cases that received an offer from that broker; the numerator requires completion with that broker.
- Date filters use Asia/Kolkata dates. Customer decision time is decision minus case submission. Deal value is not profit.

## Verification

The database suite runs all migrations in isolated PostgreSQL WASM, with small Auth/Storage schema fixtures and no connection to your Supabase project. PostgreSQL's built-in UUID generator replaces the unavailable `pgcrypto` extension in this test environment only.

```bash
npm install --prefix /tmp/utrust-db-check --no-package-lock --no-save @electric-sql/pglite@0.5.8
PGLITE_MODULE=/tmp/utrust-db-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-broker-db.mjs
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

Coverage includes privacy/RLS, automatic photo visibility, scoped reports, approval/suspension, draft editing, the single-PO direct-purchase and broker-route workflows, private offers, stale revisions, competing selections, deadline boundaries, completion confirmations, reconfirmation, consent withdrawal, and idempotent cleanup. PGlite has one connection; exercise multi-session contention and actual Cron/Storage integration in staging too.

## Persistent Vehicle Journey Tests

`scripts/test-vehicle-journeys.mjs` exercises the running app with separate browser sessions for Procurement Officers, Sales Managers, a Cluster Manager, an Admin, a Broker Coordinator, and competing brokers. It keeps clearly labelled synthetic accounts, vehicles, uploaded images, offers, reservations, and audit events in the connected Supabase project for later inspection. No real vehicle inspection or payment takes place.

Since `0024`, the fixture picks two free branches that share a cluster (for Cluster Manager scope coverage) plus a third free branch in a different cluster (to prove that scope has a limit), and provisions a Cluster Manager and an Admin account instead of a branch/group manager. Broker approval goes through the Admin account at `/admin/brokers`. Since `0031`, there's no separate Sales Officer actor and no manual photo review step — a single Procurement Officer account creates each case (customer/vehicle/photos/prices in one form), submits it, and records the customer's decision; Broker Coordinator still selects the winning offer and closes the deal, but no longer gates the listing or approves photos.

The default run is `QA20261003A`. In **Manager > All Cases**, search for that marker, or open `/manager/cases?q=QA20261003A`. Case detail shows the saved activity log, acting roles, decision reasons, prices, and broker reservation history. PO accounts see their own branch assignments; brokers see their own bids and reservations.

The eleven retained scenarios cover direct purchase closed, broker sale closed, an accepted active 48-hour hold, released/rejected/reconfirmed bidding, rejection without listing consent, PO withdrawal before a decision, direct purchase cancellation, consent withdrawal after broker suspension/reactivation, and cases left at draft, customer decision, and purchase completion stages. The active hold expires normally after 48 hours. Deadline/cron edge cases run in the isolated database suite above; the live test never backdates reservations.

Install the browser test tools outside the application dependencies and run the app first:

```bash
npm install --prefix /tmp/utrust-ui-check --no-package-lock --no-save @playwright/test@1.63.0
node scripts/test-vehicle-journeys.mjs --preflight
PLAYWRIGHT_MODULE=/tmp/utrust-ui-check/node_modules/playwright/index.mjs \
PLAYWRIGHT_TEST_MODULE=/tmp/utrust-ui-check/node_modules/@playwright/test/index.mjs \
node scripts/test-vehicle-journeys.mjs --run-live
```

The runner uses `/usr/bin/chromium-browser` by default; override with `QA_CHROMIUM`. Override the app URL with `QA_BASE_URL`. A new fixture needs two branches without active POs, so test submissions never get assigned to existing staff. Account provisioning alone uses the service key; case workflows use the actual UI and role-authenticated RPCs, including simultaneous competing selection requests.

Results, screenshots, progress checkpoints, and private test login credentials are written under `test-results/QA20261003A/` (gitignored). `credentials.json` contains the generated test password and account identifiers; it must not be published. `report.json` contains verification results and case URLs without passwords or tokens. Re-running `--run-live` resumes completed checkpoints. Use `--verify-only` with the same Playwright environment variables to inspect existing records/screens without creating or progressing vehicles. Use a different `QA_RUN_ID` beginning with `QA` to create a separate dataset.
