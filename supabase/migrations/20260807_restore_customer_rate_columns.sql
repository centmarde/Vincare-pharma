-- ============================================================================
-- Restore the four customer rate columns dropped by the real-data import
-- (2026-08-07)
--
-- The import replaced typed rate columns with free-text equivalents:
--   markup_percent            -> price_offered    ('SYSTEM PRICE + 30%', 'PLUS 15%')
--   rebate_rate + ratio       -> receipt_details  ('JUAN DELA CRUZ | 20% + 5% ADS')
--   discount_rate             -> (nothing)
--
-- The narrative columns are the better record of what was AGREED, and they stay.
-- But four columns the app actively computes from went away with them, and
-- nothing replaced them as machine-readable values:
--
--   * ethical/composables/useCreateOrder.ts  — discountAmount / rebateAmount are
--     subtotal * rate; with the columns gone they read undefined -> 0, so every
--     Ethical order is silently invoicing ZERO discount and ZERO rebate.
--   * ethical/components/CustomerForm.vue    — markupDivisorLabel and the
--     giveawayExceedsMarkup guardrail (warns when discount+rebate erodes the
--     markup funding them). The form also 400s on save, because it still writes
--     all four.
--
-- Restoring them exactly as they were is deliberately the SMALLEST fix: zero
-- code changes, the feature works again, and it is forward-compatible with the
-- planned pricing rework (which adds ads_rate + price_basis on top and
-- backfills these from the narrative columns).
--
-- Values come back NULL. The code already treats NULL as 0% / "no markup", so
-- behaviour is unchanged until someone populates them — no order silently
-- re-prices on the day this runs.
-- ============================================================================

alter table public.customers
  add column if not exists discount_rate             numeric,
  add column if not exists rebate_rate               numeric,
  add column if not exists markup_percent            numeric,
  add column if not exists rebate_ratio_distribution text;

comment on column public.customers.discount_rate is
  'On-invoice price reduction, %. Lowers what the customer owes. Snapshotted per order as ethical_details.discount_amount — never recompute a past order from this.';
comment on column public.customers.markup_percent is
  'Markup over SYSTEM PRICE, %. price = system_price / (100 - markup)%. Narrative source of truth stays in price_offered.';
comment on column public.customers.rebate_rate is
  'Cash rebate, %. Accrued separately (DR 6030 / CR 2020) at full payment; does NOT reduce what the customer owes. Narrative source stays in receipt_details.';

notify pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='customers'
--     and column_name in ('discount_rate','rebate_rate','markup_percent',
--                         'rebate_ratio_distribution');
--
-- ── NOT done here (the planned pricing rework) ──────────────────────────────
-- 1. ads_rate numeric  — the in-kind giveaway ('20% + 5% ADS'). Economically the
--    same give as a rebate, but it posts to 6010 Ads & Promo, not 6030, so it
--    cannot share rebate_rate.
-- 2. price_basis text  — SYSTEM / REGULAR / SRP / PER_PR, since 'REGULAR PRICE'
--    and 'SRP' are different bases, not markups.
-- 3. Backfill from price_offered / receipt_details: 121 of 129 rows parse
--    cleanly; 8 need a per-product-class rule ('SYSTEM PRICE ON BRANDED') that
--    cannot be applied yet — products carry no branded/generic flag
--    (products.category is NULL on all 1000; brand holds the trade name).
-- ============================================================================
