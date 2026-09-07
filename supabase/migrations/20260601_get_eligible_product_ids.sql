-- RPC function to get eligible product IDs.
-- Filters: products.sku != 'null'
-- Excludes products that are flagged for reorder AND sitting at zero stock.
-- Optional category filter: pass p_category to restrict to a products.category value.
-- Returns distinct product IDs only, minimizing query egress.
create or replace function get_eligible_product_ids(p_category text default null)
returns table (product_id bigint)
language sql
stable
as $$
  select distinct p.id as product_id
  from products p
  where p.sku != 'null'
    and (p_category is null or p.category = p_category)
    and not (p.is_reorder is true and coalesce(p.current_stock, 0) = 0);
$$;