-- nippon_offer_price was never dropped from cases in 0035 -- the offer now
-- lives in case_offers.offer_price (set by submit_po_evaluation), same as
-- the original pre-0031 design. Nothing writes to this column any more
-- (it isn't in the restored update grant), so drop it.
alter table cases drop column if exists nippon_offer_price;
