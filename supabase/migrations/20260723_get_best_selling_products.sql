create or replace function public.get_best_selling_products(
  p_start_date timestamp with time zone default null,
  p_end_date timestamp with time zone default null,
  p_limit integer default null
)
returns table (
  product_id bigint,
  product_name text,
  sku text,
  category text,
  transaction_count bigint,
  total_qty_sold numeric,
  total_revenue numeric,
  rank bigint
)
language plpgsql
stable
as $$
begin
  return query
  select
    ti.product_id,
    p.product_name,
    p.sku,
    p.category,
    count(distinct ti.transaction_id) as transaction_count,
    coalesce(sum(ti.qty_stock_out), 0) as total_qty_sold,
    coalesce(sum(ti.line_total), 0) as total_revenue,
    row_number() over (
      order by count(distinct ti.transaction_id) desc,
               coalesce(sum(ti.qty_stock_out), 0) desc
    ) as rank
  from public.transaction_items ti
  left join public.products p on p.id = ti.product_id
  where ti.product_id is not null
    and (p_start_date is null or ti.created_at >= p_start_date)
    and (p_end_date is null or ti.created_at <= p_end_date)
  group by ti.product_id, p.product_name, p.sku, p.category
  order by transaction_count desc, total_qty_sold desc
  limit p_limit;
end;
$$;