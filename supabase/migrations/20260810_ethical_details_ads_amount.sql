-- ============================================================================
-- ethical_details.ads_amount — persist the in-kind marketing give (2026-08-10)
--
-- A customer's agreed terms decompose into three components (see the `discounts`
-- table): a DISCOUNT off the invoice, a cash REBATE, and ADS — the in-kind give
-- ("food and drinks instead of cash"). All three erode margin identically, and
-- the order dialog already computes and displays all three, but only the first
-- two have a column to land in. The ads figure was being dropped on save.
--
--   discount_amount  reduces what the customer owes  -> already stored
--   rebate_amount    cash, paid out separately       -> already stored
--   ads_amount       given in kind, paid out as goods/hospitality  <- THIS
--
-- ⚠️ ADS IS NOT A REBATE, and must not be folded into rebate_amount: the two
-- post to DIFFERENT accounts.
--
--   rebate  DR 6030 Computed Rebates  / CR 2020 Accrued Expenses
--   ads     DR 6010 Ads & Promo       / CR 2020 Accrued Expenses
--
-- Merging them would overstate 6030, understate 6010, and quietly corrupt the
-- selling-expense split on the Income Statement.
--
-- Like discount_amount and rebate_amount this is a SNAPSHOT of what was applied
-- to this order. Never recompute a past order from the customer's current rates
-- — editing a customer would silently rewrite history and the GL with it.
--
-- Nullable, no default beyond 0: existing orders genuinely had no ads figure
-- recorded, and 0 is the correct historical value for them.
-- ============================================================================

alter table public.ethical_details
  add column if not exists ads_amount numeric not null default 0;

comment on column public.ethical_details.ads_amount is
  'In-kind marketing give (ADS) applied to this order, in pesos. Snapshot, not recomputed. Posts to 6010 Ads & Promo — NOT 6030, which is cash rebates (rebate_amount).';

notify pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='ethical_details'
--     and column_name in ('discount_amount','rebate_amount','ads_amount');

-- ============================================================================
-- ⚠️ STILL OPEN AFTER THIS — the GL does not book ads
--
-- `gl_project_events` books the ethical invoice (DR 1030 / CR 4010, discount to
-- 6020) and `ethicalData.recordCollection` accrues the rebate (DR 6030 / CR
-- 2020) at full payment. NOTHING books ads_amount, so once this column carries
-- real figures, 6010 Ads & Promo will understate the true cost of sales.
--
-- Wiring it up means mirroring the rebate treatment — accrue DR 6010 / CR 2020
-- at the same point the rebate accrues, and settle it when the goods or
-- hospitality are actually provided. That is an accountant decision (when is an
-- in-kind give incurred?), so it is deliberately NOT done here.
-- ============================================================================
