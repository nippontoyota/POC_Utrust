-- Mirror the client-side vehicle registration year / number rules at the
-- database level so they hold regardless of client.
-- Registration year: 1980 through the current year (matches the SO form's
-- dropdown, which only ever offers that range).
alter table cases add constraint cases_registration_year_check
  check (registration_year is null or (registration_year between 1980 and extract(year from now())::int));

-- Vehicle registration number: length only, not an exact shape -- Indian
-- plates run 9-11 characters once normalized (e.g. KL01AB1234, DL1CAB1234,
-- the newer 22BH1234AA Bharat-series), and formats vary enough by state/era
-- that a stricter regex risks rejecting a real but unusual plate.
alter table cases add constraint cases_vehicle_reg_number_length_check
  check (vehicle_reg_number is null or (length(vehicle_reg_number) between 9 and 11));
