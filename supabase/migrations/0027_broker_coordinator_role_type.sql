-- New role: Broker Coordinator. Owns the entire broker-marketplace workflow
-- (photo review, offer selection, customer broker-price decision, deal
-- completion) for any case that has entered the broker route. The Sales
-- Officer still records the initial reject + broker-consent decision; from
-- there, Broker Coordinator takes over. Company-wide scope, like PO Manager
-- and Admin. Enum additions must be their own migration/transaction.
alter type app_role add value 'broker_coordinator';
