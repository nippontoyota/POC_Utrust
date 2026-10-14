-- New role: PTL (Purchase Team Lead) -- sits between Purchase Officer and
-- PO Manager in the hierarchy. A PTL manually assigns submitted cases to a
-- free PO in the branch(es) they cover, instead of the old automatic
-- round-robin, and gets a branch-scoped dashboard of what their POs are doing.
--
-- ALTER TYPE ... ADD VALUE must be its own migration, separate from any
-- statement that uses the new value (same rule that applied to the 'ceo'
-- role in 0045) -- the scope-check constraint, manager_case_access, and the
-- assignment functions that reference 'ptl' all follow in later migrations.
alter type app_role add value 'ptl';
