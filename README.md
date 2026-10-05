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

1. Apply migrations in numeric order through `supabase/migrations/0016_case_color_optional_expected_price.sql` using the Supabase SQL editor or migration runner before deploying the updated app. Migration `0015` makes variant optional; `0016` makes customer expected price optional and adds the vehicle colour column and its draft-editing permission.
2. Enable Supabase Cron (`pg_cron`) and execute `supabase/setup-broker-cron.sql` as the database owner. It schedules expiry every minute and is safe to rerun.
3. A group manager approves applications under **Broker Access**. Branch managers have scoped reporting but cannot approve or suspend marketplace accounts. Staff sign in with Employee ID; brokers use the Broker login tab and email/password. Broker IDs are reference numbers, not credentials.
4. The owning SO reviews photos in the case's **Broker Marketplace** section. All existing images start private. Listings remain hidden until at least one image is explicitly approved. Plate-visible images cannot be approved; review also confirms there are no personal details or documents.
5. Verify one complete flow with SO, PO, broker, branch-manager, and group-manager accounts in your deployment environment. The isolated test suite below does not apply migrations or create users in your connected Supabase project.

Required `.env.local` entries: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. If Turbopack cannot start its worker, use `npm run dev -- --webpack` and `npm run build -- --webpack`.

SO colour suggestions are keyed by make and model in `src/lib/vehicleColors.ts`, with the official source beside each palette. They cover selected model-year palettes, not every historical trim; unlisted models or shades use **Other** for manual entry. Changing make or model clears the previous colour. Both variant and customer expected price may be left blank.

Check the scheduler with:

```sql
select jobname, schedule, active from cron.job
where jobname = 'expire-broker-reservations';
select status, return_message, start_time from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'expire-broker-reservations')
order by start_time desc limit 10;
```

## Broker Workflow and Access

- SO uploads 6-10 vehicle photos plus a required RC book photo (one image, maximum 5MB) before submitting to an assigned branch PO. The RC image does not count toward the vehicle-photo minimum or limit and is never available to brokers. Existing submitted cases do not need retrospective uploads. The PO explicitly starts evaluation before submitting an immutable inspection and price.
- Customer acceptance of the PO offer follows the existing direct-purchase completion flow. Rejection plus consent enables broker listing.
- Approved, unsuspended brokers browse across branches and submit private offers. They receive their own amount/history, vehicle specifications, location, approved photos, and availability. Customer contacts, expected price, PO valuation, competing offers, and raw cases/events remain private.
- SO selects an offer, with a reason required for choosing a lower price. Selection snapshots the amount and starts an exclusive 48 elapsed hours, including weekends. Offers are frozen during the hold.
- Customer acceptance belongs to the reservation and does not extend it. SO confirms payment and handover before the deadline to close the broker deal.
- Rejection, release, or expiry reopens bidding and requires earlier current/selected offers to be reconfirmed. Customer consent withdrawal delists the case. Suspension denies access, withdraws offers, and releases active holds; reactivation never resurrects them.
- Managers inspect branch-scoped histories and reports; group managers see all branches. Account decisions and case actions have database audit records.

`broker_offers` keeps one current record per broker/case, with revisions recorded in `case_events`. `broker_reservations` keeps every price snapshot and outcome. Protected writes use RPCs; clients cannot directly update workflow tables or privileged metadata. `broker_marketplace` returns an explicit field allowlist instead of exposing `cases` to brokers.

Mutations validate database time, lock the case, and settle expiry before acting. Reads project an elapsed hold as expired even when Cron is delayed. Business conflicts return an error result instead of rolling back a settled expiry. A partial unique index prevents multiple active holds. Marketplace writes use one advisory transaction lock for this POC; ordered finer-grained locks are the upgrade path if write volume warrants it.

No hold extensions, automatic winning bids, deposits, commissions, payment processing, or external messages are included. Listings do not expire automatically. Signed photo links already issued may remain usable for up to five minutes after access revocation.

## Reporting Definitions

- Live listings, no-current-offer cases, active holds, and holds expiring within two hours are current inventory measures, independent of date filters.
- Completed deals and broker deal value use completion date. Reservation performance and release reasons use attempts started in the selected period.
- Listing cohort conversion is eventually completed broker cases divided by cases first listed in the selected period. It counts a case once despite multiple attempts. Broker-filtered cohorts contain cases that received an offer from that broker; the numerator requires completion with that broker.
- Date filters use Asia/Kolkata dates. PO turnaround is evaluation submission minus case submission; customer decision time is decision minus PO submission. Deal value is not profit.

## Verification

The database suite runs all migrations in isolated PostgreSQL WASM, with small Auth/Storage schema fixtures and no connection to your Supabase project. PostgreSQL's built-in UUID generator replaces the unavailable `pgcrypto` extension in this test environment only.

```bash
npm install --prefix /tmp/utrust-db-check --no-package-lock --no-save @electric-sql/pglite@0.5.8
PGLITE_MODULE=/tmp/utrust-db-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-broker-db.mjs
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

Coverage includes privacy/RLS, photo review, scoped reports, approval/suspension, draft editing, direct purchase, private offers, stale revisions, competing selections, deadline boundaries, completion confirmations, reconfirmation, consent withdrawal, and idempotent cleanup. PGlite has one connection; exercise multi-session contention and actual Cron/Storage integration in staging too.

## Persistent Vehicle Journey Tests

`scripts/test-vehicle-journeys.mjs` exercises the running app with separate browser sessions for Sales Officers, Purchase Officers, branch managers, a group manager, and competing brokers. It keeps clearly labelled synthetic accounts, vehicles, uploaded images, offers, reservations, and audit events in the connected Supabase project for later inspection. No real vehicle inspection or payment takes place.

The default run is `QA20261003A`. In **Manager > All Cases**, search for that marker, or open `/manager/cases?q=QA20261003A`. Case detail shows the saved activity log, acting roles, decision reasons, prices, and broker reservation history. SO and PO accounts see their own branch assignments; brokers see their own bids and reservations.

The twelve retained scenarios cover direct purchase closed, broker sale closed, an accepted active 48-hour hold, released/rejected/reconfirmed bidding, rejection without listing consent, SO withdrawal, direct purchase cancellation, consent withdrawal after broker suspension/reactivation, and cases left at draft, evaluation, customer decision, and purchase completion stages. The active hold expires normally after 48 hours. Deadline/cron edge cases run in the isolated database suite above; the live test never backdates reservations.

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
