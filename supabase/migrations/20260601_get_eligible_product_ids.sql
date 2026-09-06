-- RPC function to get eligible product IDs.
-- Filters: products.sku != 'null'
-- Excludes products that are flagged for reorder AND sitting at zero stock.
-- Returns distinct product IDs only, minimizing query egress.
create or replace function get_eligible_product_ids()
returns table (product_id bigint)
language sql
stable
as $$
  select distinct p.id as product_id
  from products p
  where p.sku != 'null'
    and not (p.is_reorder is true and coalesce(p.current_stock, 0) = 0);
$$;