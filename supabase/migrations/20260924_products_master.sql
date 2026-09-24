
create or replace function products_master(
  search_term text default '',
  page_limit int default 15
)
returns table (
  id bigint,
  product_name text,
  total_count bigint
)
language sql
stable
as $$
  select
    min(p.id) as id,
    p.product_name,
    count(*) over() as total_count
  from products p
  where p.sku is not null
    and p.sku != 'null'
    and (
      search_term = '' or
      p.product_name ilike '%' || search_term || '%'
    )
  group by p.product_name
  order by min(p.id)
  limit page_limit;
$$;

grant execute on function products_master(text, int)
  to anon, authenticated, service_role;
