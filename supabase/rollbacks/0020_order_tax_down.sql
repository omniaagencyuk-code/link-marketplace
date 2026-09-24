-- ---------------------------------------------------------------------------
-- Undo 0020: VAT on orders
--
-- Removes the record of how much VAT was charged on every paid order. The
-- payments themselves are unaffected - Stripe remains the source of truth and
-- still holds every figure - but this database will no longer know the
-- difference between what an order was priced at and what was taken for it.
--
-- Run it only alongside reverting the checkout change that populates these.
-- ---------------------------------------------------------------------------

alter table public.orders drop column if exists tax_minor;

alter table public.orders drop column if exists charged_minor;
