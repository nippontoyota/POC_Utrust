-- Two new branches so Vipin M P's PTL coverage (TI01A, IR01A, + these two)
-- can be completed -- they were referenced by location name in the PTL/PO
-- roster sheet (NDTRA, KNKLM) but never existed as their own branch rows.
-- Same cluster as the other Thrissur-area branches (TI01A/IR01A/MV01A).
insert into branches (code, name, cluster_id, display_order)
select 'TI01B', 'Nadathara', cluster_id, 14 from branches where code = 'TI01A'
union all
select 'TI01C', 'Kunnamkulam', cluster_id, 15 from branches where code = 'TI01A';
