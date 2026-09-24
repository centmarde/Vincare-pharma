-- products_batches — Product Picker search at BATCH grain.
--
-- WHY THIS EXISTS ALONGSIDE products_master
-- One `products` row IS one batch. products_master groups by product_name and
-- returns min(p.id), which is right for Purchasing (a PR mints a NEW batch row
-- and the dialog collects its own expiry), but wrong everywhere stock is SOLD
-- from: it hands the caller an arbitrary batch — the lowest id — with no batch
-- no., expiry or quantity on screen to judge it by. Live example:
--
--   AMPICILLIN+SULBACTAM 500MG/250MG VIAL 1S SACRIVA
--     id 25  batch 63123100   exp 2026-10  stock 460   <- min(id), what you got
--     id 27  batch 631240104  exp 2027-01  stock 3360  <- what you wanted
--
-- For In-House that compounds with the 18-month government shelf-life rule:
-- the order is accepted at entry and then refused at deliver().
--
-- STOCK IS LOCATION-RESOLVED, and the two shapes are NOT interchangeable
-- (see stockSourcingData.ts, the single resolver this mirrors):
--     location_id IS NULL  -> main warehouse, products.current_stock
--     location_id = <id>   -> that branch, warehouse_products.total_qty
-- Returning current_stock for a branch — which the old search_products_with_sku
-- did — reports main-warehouse stock on an outlet order.
--
-- PAGING IS BY NAME, NOT BY ROW. page_limit caps distinct product_names and
-- every batch of those names comes back, so a name can never arrive with some
-- of its batches cut off by the page boundary (which would contradict the
-- batch_count shown beside it). total_count is the distinct-name count, so the
-- picker's existing "load more" arithmetic is unchanged.
--
-- Supplier identity stays out: supplier_id is returned (Purchasing's PR dialogs
-- set the line's supplier from it), supplier NAME is not.

create or replace function products_batches(
  search_term text default '',
  location_id bigint default null,
  page_limit int default 30
)
returns table (
  id bigint,
  product_name text,
  brand text,
  unit text,
  sku text,
  batch_no text,
  expiry_date date,
  stock bigint,
  cost_price numeric,
  selling_price numeric,
  supplier_id bigint,
  batch_count bigint,
  total_count bigint
)
language sql
stable
as $$
  with matched as (
    select p.*
    from products p
    where p.sku is not null
      and p.sku <> 'null'
      and (
        search_term = ''
        or p.product_name ilike '%' || search_term || '%'
        or p.brand        ilike '%' || search_term || '%'
        or p.sku          ilike '%' || search_term || '%'
      )
  ),
  names as (
    select m.product_name, count(*) over () as total_count
    from matched m
    group by m.product_name
    order by m.product_name
    limit page_limit
  )
  select
    m.id,
    m.product_name,
    m.brand,
    m.unit,
    m.sku,
    m.batch_no,
    m.expiry_date,
    -- Scalar subquery, not a join: a duplicate warehouse_products row would
    -- otherwise multiply the batch into two picker entries.
    (case
       when location_id is null then coalesce(m.current_stock, 0)
       else coalesce((
         select sum(wp.total_qty)
         from warehouse_products wp
         where wp.product_id = m.id
           and wp.warehouse_id = location_id
       ), 0)
     end)::bigint as stock,
    m.cost_price,
    m.selling_price,
    m.supplier_id,
    count(*) over (partition by m.product_name)::bigint as batch_count,
    n.total_count
  from matched m
  join names n on n.product_name = m.product_name
  -- FEFO: first-expiring first, the standard pick order for pharma. Undated
  -- batches sort last rather than first, so a missing expiry never outranks a
  -- real one.
  order by m.product_name, m.expiry_date asc nulls last, m.id
$$;

grant execute on function products_batches(text, bigint, int)
  to anon, authenticated, service_role;
