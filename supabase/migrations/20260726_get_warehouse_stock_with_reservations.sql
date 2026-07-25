-- RPC function to get warehouse stock details with all related reservations
-- for a given warehouse. Returns per-product: total_qty, available stock
-- (total_qty - sum of reserved_qty), and a JSON array of reservations
-- with customer names and reserved quantities.
create or replace function get_warehouse_stock_with_reservations(
  p_warehouse_id bigint
)
returns table (
  warehouse_product_id bigint,
  product_id           bigint,
  total_qty            bigint,
  available_stock      bigint,
  reservations         jsonb
)
language sql
stable
as $$
  select
    wp.id as warehouse_product_id,
    wp.product_id,
    wp.total_qty,
    wp.total_qty - coalesce(rp_sum.total_reserved, 0) as available_stock,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'customer_name', c.name,
          'reserved_qty',  rp.reserved_qty
        )
        order by rp.created_at desc
      ) filter (where rp.id is not null),
      '[]'::jsonb
    ) as reservations
  from warehouse_products wp
  left join reserved_products rp on rp.warehouse_products_id = wp.id
  left join customers c on c.id = rp.customer_id
  left join lateral (
    select sum(rp2.reserved_qty) as total_reserved
    from reserved_products rp2
    where rp2.warehouse_products_id = wp.id
  ) rp_sum on true
  where wp.warehouse_id = p_warehouse_id
  group by wp.id, wp.product_id, wp.total_qty, rp_sum.total_reserved
  order by wp.product_id;
$$;