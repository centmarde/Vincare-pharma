-- RPC function to get eligible product IDs.
-- Filters: products.sku != 'null'
-- Returns distinct product IDs only, minimizing query egress.
create or replace function get_eligible_product_ids()
returns table (product_id bigint)
language sql
stable
as $$
  select distinct p.id as product_id
  from products p
  where p.sku != 'null';
$$;