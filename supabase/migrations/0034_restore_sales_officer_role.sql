-- Revert the single-Procurement-Officer workflow (0031-0033): restore the
-- Sales Officer role, the SO -> PO (round-robin) -> SO handoff, and the
-- separate PO evaluation step with case_offers. Three things from the
-- intervening work are deliberately KEPT, not reverted:
--   1. Automatic broker-photo visibility (case_photos_auto_broker_visible
--      trigger) -- no manual review step comes back.
--   2. The single undifferentiated broker reference price in
--      broker_marketplace() -- untouched by this migration.
--   3. Broker Coordinator stays out of photo review and the listing gate
--      (broker_case_action is untouched by this migration).
-- All case data has already been cleared out (empty drafts only), so the
-- column/type changes below have no rows to reconcile.

-- =========================================================================
-- 1. Add the enum values back. Both are pure additions (nothing is being
--    removed), so a simple ADD VALUE works -- no need to recreate either
--    type or touch any function/policy that references them by name.
-- =========================================================================
alter type app_role add value if not exists 'sales_officer';
alter type case_status add value if not exists 'pending_evaluation' before 'pending_customer_decision';
