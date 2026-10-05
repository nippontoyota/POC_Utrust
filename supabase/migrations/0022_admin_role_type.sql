-- New role sub-type, its own migration since Postgres won't let a freshly
-- added enum value be used for comparisons within the same transaction.
alter type app_role add value 'admin';
