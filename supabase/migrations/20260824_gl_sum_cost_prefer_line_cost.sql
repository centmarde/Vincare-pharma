-- gl_sum_cost: always prefer the line's own cost snapshot.
--
-- WHY THIS, AND NOT AN EDIT TO gl_project_events
-- The goal is for POS and Ethical sales to relieve inventory at the cost
-- recorded on the sale line, the way In-House already does. Those two call
-- sites pass p_use_line_cost => false:
--
--     POS      gl_sum_cost(r.id, 'qty', false)
--     Ethical  gl_sum_cost(r.id, 'qty', false)
--     In-House gl_sum_cost(r.id, 'delivered_qty', true)
--
-- Flipping those two literals would mean a CREATE OR REPLACE of the ~300-line
-- gl_project_events, and that function has a documented history of drift
-- (20260727 is recorded as written-but-unapplied while 20260813 and 20260817
-- build on it, so the live definition cannot be assumed to match any one file
-- in this repo). Replacing it from a file that is behind prod would silently
-- revert whatever is actually deployed.
--
-- Changing the eight-line helper instead achieves the same thing and cannot
-- clobber anything: gl_project_events keeps calling it with the same
-- signature, whichever version of it is live.
--
-- WHAT CHANGES
-- Before: p_use_line_cost decided whether ti.cost_price was consulted at all.
--         When false the line snapshot was ignored outright and cost came from
--         the CURRENT products.cost_price — so a past sale was valued at
--         whatever the master file said when the ledger was next resynced, and
--         at zero when it said nothing. gl_project_events only emits the
--         DR 5010 / CR 1040 pair `if v_cogs > 0`, so a null cost produced a
--         sale posted at 100% margin with inventory never relieved and no
--         error anywhere.
-- After:  the line snapshot wins whenever it exists; products.cost_price stays
--         as the fallback for rows that predate the snapshot (and for any flow
--         that still does not write one), then 0 as before.
--
-- NO BEHAVIOUR CHANGE FOR EXISTING DATA: every current outbound line either
-- has a cost (in-house) or has NULL (POS/Ethical), and NULL still falls through
-- to products.cost_price exactly as it does today. Posted journal entries are
-- never re-projected, so nothing already booked moves.
--
-- p_use_line_cost is kept in the signature deliberately. Dropping it would
-- change the function's identity and break every existing call site in
-- whichever gl_project_events is deployed.

create or replace function public.gl_sum_cost(
  p_txn bigint,
  p_qty_field text,
  -- Retained for signature compatibility with gl_project_events' call sites.
  -- The line cost is now always preferred when present, so this no longer
  -- gates anything.
  p_use_line_cost boolean
) returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(
    (case when p_qty_field = 'delivered_qty' then coalesce(ti.actual_count_stock_out, 0)
          else coalesce(ti.qty_stock_out, 0) end)
    * coalesce(ti.cost_price, p.cost_price, 0)
  ), 0)
  from transaction_items ti
  left join products p on p.id = ti.product_id
  where ti.transaction_id = p_txn;
$$;

grant execute on function public.gl_sum_cost(bigint, text, boolean)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STILL OUTSTANDING after this migration (neither is fixed here):
--
-- 1. A sale whose product has no cost anywhere still books revenue with no
--    COGS and no warning, because gl_project_events guards on `if v_cogs > 0`.
--    The books balance and read 100% margin. Making that visible (a count of
--    cost-less sales on the Trial Balance, say) is a separate change.
--
-- 2. products.cost_price is null on 1,933 of 2,401 SKU'd products, so the
--    fallback above is empty for most of the catalogue. Until that is
--    backfilled, gross profit is not a real number. stock_in lines record what
--    was actually paid and may be a usable source for a derived backfill.
-- ─────────────────────────────────────────────────────────────────────────────
