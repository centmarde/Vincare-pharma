-- RPC function to search products for the Product Picker.
-- Filters: sku IS NOT NULL (and not the literal string 'null'), optional text search
-- across item_decription (actual column name in `products`) and sku.
-- Returns rows plus total_count (via window function) so the client can page accurately.
create or replace function search_products_with_sku(
  search_term text default '',
  page_limit int default 30
)
returns table (
  id bigint,
  product_name text,
  unit text,
  cost_price numeric,
  selling_price numeric,
  supplier_id bigint,
  supplier_name text,
  supplier_is_active boolean,
  total_count bigint
)
language sql
stable
as $$
  select
    p.id,
    p.product_name,
    p.unit,
    p.cost_price,
    p.selling_price,
    p.supplier_id,
    s.name as supplier_name,
    s.is_active as supplier_is_active,
    count(*) over() as total_count
  from products p
  left join suppliers s on s.id = p.supplier_id
  where p.sku is not null
    and p.sku != 'null'
    and (
      search_term = '' or
      p.product_name ilike '%' || search_term || '%' or
      p.sku ilike '%' || search_term || '%'
    )
  order by p.product_name
  limit page_limit;
$$;