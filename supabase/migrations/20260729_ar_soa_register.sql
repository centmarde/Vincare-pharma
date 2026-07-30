-- ============================================================================
-- AR Statement of Accounts register — supporting schema (2026-07-29)
--
-- Backs the DR-level SOA register (the accountant's Excel "STATEMENT OF
-- ACCOUNTS" sheet). ONE additive column, no new tables.
--
--   PO AMOUNT -> transactions.po_amount
--
-- The sheet's CREDIT and PDC columns are deliberately NOT modelled: both would
-- need a table of their own and the lead dev's call is no new tables. They
-- render as blank placeholders in the register so the layout still matches the
-- workbook; see the note at the bottom for what wiring them up would take.
--
-- Additive only, per the isolation rule: nothing existing is moved or renamed,
-- so every other module's queries keep working untouched.
--
-- Gitignored -- run manually in the Supabase SQL editor per repo convention.
-- ============================================================================

-- The PO *number* was already captured (transactions.po_no, snapshotted onto
-- delivery_receipts.po_no); its peso value never was. Nullable: historical
-- orders have no value to backfill, and In-House govt POs are the only ones
-- that reliably carry one.
alter table public.transactions
  add column if not exists po_amount numeric;

comment on column public.transactions.po_amount is
  'Customer/government PO value for this order. Documentation only — no logic keys off it (same rule as inhouse_details.govt_po_no).';

-- ============================================================================
-- NOT BUILT — the two columns with no home in the schema
--
-- CREDIT (credit memos: returns, price adjustments, short deliveries) and the
-- PDC column (post-dated checks received from customers) both hold money, so
-- neither can live on an existing table without overloading it:
--
--   * a credit memo is not a `collection` — it settles nothing, it reduces the
--     receivable, and it posts DR 4020 Sales Returns / CR 1030 AR;
--   * a PDC is not cash — it sits in 1035 PDC Receivable until it clears, and
--     has its own received -> deposited -> cleared | bounced lifecycle.
--
-- Recording either as a `collections` row would overstate cash and misstate the
-- GL. If they're wanted later they need their own tables plus gl_project_events
-- loops; until then the register shows those columns blank rather than
-- fabricating a number.
-- ============================================================================
