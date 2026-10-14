-- New case_status: 'pending_assignment' -- the gap between "SO submitted"
-- and "a PTL handed it to a specific PO", which didn't exist before (the old
-- round-robin assigned a PO the instant a case was submitted). Standalone
-- migration for the same ALTER TYPE ADD VALUE reason as 0053.
alter type case_status add value 'pending_assignment' after 'draft';
