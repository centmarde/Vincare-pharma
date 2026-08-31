create or replace function get_stock_status_products(
  bucket_type text,
  ref_year int default null,
  ref_month int default null,
  excluded_ids bigint[] default '{}',
  page_limit int default 200,
  page_offset int default 0,
  search_term text default ''
)
returns table (
  id bigint,
  product_name text,
  sku text,
  barcode text,
  unit text,
  current_stock int,
  reorder_level int,
  cost_price numeric,
  selling_price numeric,
  supplier_id bigint,
  supplier_name text,
  batch_no int,
  expiry_date date,
  status text,
  total_count bigint
)
language sql
stable
as $$
  with ref as (
    select case when ref_year is not null and ref_month is not null
      then make_date(ref_year, ref_month, 1) else null end as ref_date
  )
  select
    p.id, p.product_name, p.sku, p.barcode, p.unit,
    p.current_stock, p.reorder_level, p.cost_price, p.selling_price,
    p.supplier_id, s.name as supplier_name, p.batch_no, p.expiry_date, p.status,
    count(*) over() as total_count
  from products p
  left join suppliers s on s.id = p.supplier_id
  cross join ref r
  where p.sku is not null
    and p.sku != 'null'
    and not (p.id = any(excluded_ids))
    and (search_term = '' or p.product_name ilike '%' || search_term || '%')
    and case bucket_type
      when 'out-of-stock' then coalesce(p.current_stock, 0) <= 0
      when 'low-stock' then coalesce(p.current_stock, 0) > 0
        and p.reorder_level is not null
        and coalesce(p.current_stock, 0) <= p.reorder_level
      when 'no-reorder-level' then p.reorder_level is null
      when 'expiring-soon' then p.expiry_date is not null and (
        (r.ref_date is null
          and p.expiry_date >= current_date
          and p.expiry_date <= current_date + 540)
        or
        (r.ref_date is not null and (
          (extract(year from p.expiry_date)::int * 12 + extract(month from p.expiry_date)::int)
          - (extract(year from r.ref_date)::int * 12 + extract(month from r.ref_date)::int)
        ) between 0 and 18)
      )
      when 'expired' then p.expiry_date is not null and p.expiry_date < current_date
      else false
    end
  order by
    case when bucket_type in ('expiring-soon','expired') then p.expiry_date end asc nulls last,
    p.id asc
  limit page_limit offset page_offset;
$$;

grant execute on function get_stock_status_products to authenticated;