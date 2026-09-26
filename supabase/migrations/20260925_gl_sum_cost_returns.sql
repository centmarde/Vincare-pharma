-- gl_sum_cost: value INBOUND lines too, so a customer return can relieve/
-- reinstate inventory at cost.
--
-- THE BUG THIS PREVENTS
-- Every branch of this function reads an OUTBOUND quantity:
--
--     case when p_qty_field = 'delivered_qty' then actual_count_stock_out
--          else qty_stock_out end
--
-- A sales_return records its quantities in qty_stock_in — a row only ever
-- carries one direction — so calling the function as it stands for a return
-- falls into the `else` branch, reads qty_stock_out (always 0 on a return) and
-- returns 0. gl_project_events only emits the inventory pair `if v_cogs > 0`,
-- so the return would reverse revenue and NEVER reinstate inventory, silently
-- and with the books still balancing. Same failure shape as the null-cost case
-- 20260824 documents.
--
-- WHY A HELPER CHANGE RATHER THAN DOING IT INSIDE gl_project_events
-- Exactly the reasoning 20260824 sets out and which still holds: that function
-- has a documented history of drift, the live definition cannot be assumed to
-- match any file in this repo, and a CREATE OR REPLACE from a stale file would
-- silently revert whatever is deployed. This helper is eight lines and cannot
-- clobber anything — whichever gl_project_events is live keeps calling it with
-- the same signature.
--
-- BACKWARD COMPATIBLE: the new branch is matched by an exact literal that no
-- existing call site passes ('qty' and 'delivered_qty' are the only two in use),
-- so every current caller lands exactly where it did before. The signature is
-- unchanged, so no call site breaks and p_use_line_cost stays for identity.
--
-- The caller decides which cost applies; this only decides which QUANTITY is
-- counted. Returned lines carry their own cost_price snapshot where the return
-- was recorded from an original sale line, and fall back to products.cost_price
-- exactly as outbound lines do.
--
-- NOTE FOR THE RETURNS LOOP (not this file's job): only lines whose
-- return_condition is 'good' may reinstate inventory. Expired and broken goods
-- are a loss the moment they come back and must NOT be valued into 1040, so the
-- loop has to filter on return_condition before using this total — this
-- function deliberately sums every line it is given.

create or replace function public.gl_sum_cost(
  p_txn bigint,
  p_qty_field text,
  -- Retained for signature compatibility with gl_project_events' call sites.
  -- The line cost is always preferred when present, so this no longer gates
  -- anything.
  p_use_line_cost boolean
) returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(
    (case when p_qty_field = 'delivered_qty' then coalesce(ti.actual_count_stock_out, 0)
          when p_qty_field = 'returned_qty'  then coalesce(ti.qty_stock_in, 0)
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
-- Companion helper: the same sum, restricted to lines that may actually go back
-- into inventory. Kept separate rather than adding a fourth argument, which
-- would change gl_sum_cost's identity and break every deployed call site.
--
-- 'good' only. Expired and broken goods never re-enter sellable stock, and
-- their cost is ALREADY in COGS from the original sale — reinstating 1040 for
-- them would understate the loss and overstate the asset.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.gl_sum_return_cost(
  p_txn bigint
) returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(
    coalesce(ti.qty_stock_in, 0) * coalesce(ti.cost_price, p.cost_price, 0)
  ), 0)
  from transaction_items ti
  left join products p on p.id = ti.product_id
  where ti.transaction_id = p_txn
    and ti.return_condition = 'good';
$$;

grant execute on function public.gl_sum_return_cost(bigint)
  to anon, authenticated, service_role;
