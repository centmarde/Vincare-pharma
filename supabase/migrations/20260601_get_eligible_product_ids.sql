-- RPC function to get eligible product IDs from completed stock_in transactions.
-- Filters: transaction_type = 'stock_in', status = 'complete', products.sku IS NOT NULL
-- Returns distinct product IDs only, minimizing query egress.
create or replace function get_eligible_product_ids()
returns table (product_id bigint)
language sql
stable
as $$
  select distinct ti.product_id
  from transaction_items ti
  join transactions t on t.id = ti.transaction_id
  join products p on p.id = ti.product_id
  where t.transaction_type = 'stock_in'
    and t.status = 'complete'
    and p.sku is not null
    and p.sku != 'null';
$$;