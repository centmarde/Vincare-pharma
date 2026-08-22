-- search_products_with_sku — Product Picker search (In-House, Purchasing).
--
-- Changes in this revision (2026-08-23):
--   1. MATCH + RETURN `brand`. The catalogue is stored by molecule
--      ("ACETYLCYSTEINE 200MG SACHET 10S") but customers ask for the trade name
--      ("FLUIMUCIL"). brand is populated on 2,390 of 2,401 SKU'd products and
--      was previously neither searchable nor visible.
--   2. RETURN `current_stock`, so the picker can show on-hand without the
--      client issuing a second query per search.
--   3. STOP RETURNING `supplier_name` / `supplier_is_active`. Supplier identity
--      is confidential and must not reach sales staff. `supplier_id` is KEPT —
--      Purchasing's PR dialogs set the line's supplier from it.
--   4. Header comment corrected: the old one claimed the search covered
--      `item_decription`, a column that no longer exists (the body never used it).
--
-- DROP is required, not optional: CREATE OR REPLACE FUNCTION cannot change a
-- function's RETURNS TABLE shape ("cannot change return type of existing
-- function"), and this revision adds and removes output columns.
drop function if exists search_products_with_sku(text, int);

create function search_products_with_sku(
  search_term text default '',
  page_limit int default 30
)
returns table (
  id bigint,
  product_name text,
  brand text,
  unit text,
  current_stock bigint,
  cost_price numeric,
  selling_price numeric,
  supplier_id bigint,
  total_count bigint
)
language sql
stable
as $$
  select
    p.id,
    p.product_name,
    p.brand,
    p.unit,
    p.current_stock,
    p.cost_price,
    p.selling_price,
    p.supplier_id,
    count(*) over() as total_count
  from products p
  where p.sku is not null
    and p.sku != 'null'
    and (
      search_term = '' or
      p.product_name ilike '%' || search_term || '%' or
      p.brand        ilike '%' || search_term || '%' or
      p.sku          ilike '%' || search_term || '%'
    )
  order by p.product_name
  limit page_limit;
$$;

-- A dropped function loses its grants; re-grant or every caller gets
-- "permission denied for function search_products_with_sku".
grant execute on function search_products_with_sku(text, int)
  to anon, authenticated, service_role;
