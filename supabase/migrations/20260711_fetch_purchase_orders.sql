-- RPC to fetch Purchase Orders for the PO list.
create or replace function fetch_purchase_orders(
  p_search    text    default null,
  p_status    text[]  default null,
  p_order_by  text    default 'created_at',
  p_ascending boolean default false,
  p_limit     int     default 10,
  p_offset    int     default 0
)
returns table (
  id             bigint,
  requisition_no text,
  po_no          text,
  reference_no   text,
  status         text,
  remarks        text,
  total_amount   numeric,
  supplier_id    bigint,
  supplier_name  text,
  created_at     timestamptz,
  created_by     uuid,
  approved_by    uuid,
  updated_at     timestamptz,
  ship_via       text,
  ship_method    text,
  items          jsonb,
  total_count    bigint
)
language plpgsql
stable
as $$
declare
  v_order_by  text;
  v_direction text;
  v_pattern   text;
begin
  v_order_by := case p_order_by
    when 'created_at'    then 'created_at'
    when 'updated_at'    then 'updated_at'
    when 'total_amount'  then 'total_amount'
    when 'status'        then 'status'
    when 'po_no'         then 'po_no'
    when 'supplier_name' then 'supplier_name'
    when 'ship_via'      then 'ship_via'
    when 'ship_method'   then 'ship_method'
    else 'created_at'
  end;

  v_direction := case when p_ascending then 'asc' else 'desc' end;

  -- A blank search becomes null, which means "no search filter".
  v_pattern := '%' || nullif(trim(p_search), '') || '%';

  return query execute format(
    $f$
    select
      t.id,
      t.requisition_no,
      coalesce(t.po_no, t.reference_no) as po_no,
      t.reference_no,
      t.status,
      t.remarks,
      t.total_amount,
      t.supplier_id,
      sup.name as supplier_name,
      t.created_at,
      t.created_by,
      t.approved_by,
      t.updated_at,
      t.ship_via,
      t.ship_method,
      coalesce(items.items, '[]'::jsonb) as items,
      count(*) over() as total_count
    from transactions t
    left join suppliers sup on sup.id = t.supplier_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id',                     ti.id,
        'product_id',             ti.product_id,
        'qty_stock_in',           ti.qty_stock_in,
        'actual_count_stock_in',  ti.actual_count_stock_in,
        'product_name',           p.product_name,
        'unit',                   p.unit,
        'cost_price',             coalesce(ti.cost_price, ti.unit_price, p.cost_price),
        'sku',                    p.sku,
        'supplier_id',            p.supplier_id,
        'expiry_date',            p.expiry_date,
        'batch_no',               ti.batch_no,
        'supplier_name',          s.name
      ) order by ti.id) as items
      from transaction_items ti
      left join products  p on p.id = ti.product_id
      left join suppliers s on s.id = p.supplier_id
      where ti.transaction_id = t.id
    ) items on true
    where (t.reference_no ilike 'PO%%' or t.po_no ilike 'PO%%')
      and t.transaction_type in ('purchase_order', 'stock_in')
      and (
        $1 is null
        or t.requisition_no ilike $1
        or t.po_no          ilike $1
        or t.reference_no   ilike $1
        or t.remarks        ilike $1
        or t.status         ilike $1
        or t.ship_via       ilike $1
        or t.ship_method    ilike $1
        or sup.name         ilike $1
        -- any item whose product belongs to a matching supplier
        or exists (
          select 1
          from transaction_items ti0
          join products  p0 on p0.id = ti0.product_id
          join suppliers s1 on s1.id = p0.supplier_id
          where ti0.transaction_id = t.id
            and s1.name ilike $1
        )
        -- "delivered": the PO has items and every item is fully received
        or (
          'delivered' ilike $1
          and exists (
            select 1
            from transaction_items d1
            where d1.transaction_id = t.id
          )
          and not exists (
            select 1
            from transaction_items d2
            where d2.transaction_id = t.id
              and coalesce(d2.actual_count_stock_in, 0) < coalesce(d2.qty_stock_in, 0)
          )
        )
      )
      and ($2 is null or t.status = any($2))
    order by %I %s
    limit $3 offset $4
    $f$,
    v_order_by, v_direction
  )
  using v_pattern, p_status, p_limit, p_offset;
end;
$$;