create or replace function public.get_box_brands()
returns table (brand text)
language sql
stable
as $$
  select distinct trim(p.brand) as brand
  from public.products p
  where lower(trim(p.unit)) = 'box'
    and p.brand is not null
    and trim(p.brand) <> ''
    -- Ayaw i-apil ang mga junk brand entries: (1) mga naga-sugod ug numero
    -- (e.g. '100', '2') ug (2) single-character ra (e.g. 'A').
    and trim(p.brand) !~ '^[0-9]'
    and length(trim(p.brand)) > 1
  order by 1;
$$;

grant execute on function public.get_box_brands() to anon, authenticated;