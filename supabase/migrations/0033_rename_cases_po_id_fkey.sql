-- Renaming sales_officer_id to po_id (migration 0031) didn't rename the FK
-- constraint itself -- Postgres never does that automatically. PostgREST's
-- `profiles!cases_po_id_fkey` join hints (used throughout the manager and
-- coordinator case-detail pages) need the constraint to actually be named
-- this way.
alter table cases rename constraint cases_sales_officer_id_fkey to cases_po_id_fkey;
