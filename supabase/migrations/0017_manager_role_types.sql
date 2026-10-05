-- New manager sub-types. Split into its own migration because Postgres will not
-- let a freshly added enum value be used for comparisons within the same
-- transaction that added it.
alter type app_role add value 'sales_manager';
alter type app_role add value 'cluster_manager';
alter type app_role add value 'po_manager';
