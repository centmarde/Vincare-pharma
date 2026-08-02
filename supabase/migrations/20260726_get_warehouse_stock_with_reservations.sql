-- RPC function to get warehouse stock details with all related reservations
-- for a given warehouse. Returns individual rows per reservation (or one row
-- per product with null customer_name/reserved_qty if no reservations exist).
-- The frontend groups rows by product_id to build the reservations array.
create or replace function get_warehouse_stock_with_reservations(
  p_warehouse_id bigint
)
returns table (
  warehouse_product_id bigint,
  product_id           bigint,
  total_qty            bigint,
  available_stock      bigint,
  customer_name        text,
  reserved_qty         bigint
)
language sql
stable
as $$
  select
    wp.id as warehouse_product_id,
    wp.product_id,
    wp.total_qty,
    wp.total_qty - coalesce(rp_sum.total_reserved, 0) as available_stock,
    c.name as customer_name,
    rp.reserved_qty
  from warehouse_products wp
  left join reserved_products rp on rp.warehouse_products_id = wp.id
  left join customers c on c.id = rp.customer_id
  left join lateral (
    select sum(rp2.reserved_qty) as total_reserved
    from reserved_products rp2
    where rp2.warehouse_products_id = wp.id
  ) rp_sum on true
  where wp.warehouse_id = p_warehouse_id
  order by wp.product_id, rp.created_at desc;
$$;
