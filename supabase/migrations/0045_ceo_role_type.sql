-- New role: CEO. Read-only, company-wide, single-page overview dashboard.
-- Own migration -- Postgres won't let a freshly added enum value be used for
-- comparisons within the same transaction that added it (same pattern as
-- 0018/0022/0027 for the other role types).
alter type app_role add value 'ceo';
