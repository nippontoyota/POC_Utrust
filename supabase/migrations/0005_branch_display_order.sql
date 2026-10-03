-- Branches display in a specific business order (roughly by region), not
-- alphabetically. Explicit column rather than relying on insertion order,
-- which Postgres doesn't guarantee is preserved on read.
alter table branches add column display_order integer not null default 0;

update branches set display_order = 1 where code = 'CO01A';
update branches set display_order = 2 where code = 'CO01B';
update branches set display_order = 3 where code = 'KY01A';
update branches set display_order = 4 where code = 'TI01A';
update branches set display_order = 5 where code = 'IR01A';
update branches set display_order = 6 where code = 'MV01A';
update branches set display_order = 7 where code = 'KT01A';
update branches set display_order = 8 where code = 'KT01B';
update branches set display_order = 9 where code = 'TL01A';
update branches set display_order = 10 where code = 'PH01A';
update branches set display_order = 11 where code = 'TR01A';
update branches set display_order = 12 where code = 'TR01C';
update branches set display_order = 13 where code = 'KL01A';
