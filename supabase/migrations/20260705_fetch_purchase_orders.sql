-- RPC to fetch Purchase Orders for the PO list.
-- Filters by po_no not null, optional text search (requisition_no, po_no,
-- remarks, status) and status array. Sortable via whitelisted p_order_by.
-- Aggregates line items into `items` jsonb via lateral join. Returns
-- total_count (window function) for pagination.
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
  status         text,
  remarks        text,
  total_amount   numeric,
  supplier_id    bigint,
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
  v_order_by text;
begin
  v_order_by := case p_order_by
    when 'created_at'   then 'created_at'
    when 'total_amount' then 'total_amount'
    when 'status'       then 'status'
    when 'po_no'        then 'po_no'
    when 'ship_via'     then 'ship_via'
    when 'ship_method'  then 'ship_method'
    else 'created_at'
  end;

  return query execute format(
    $f$
    select
      t.id, t.requisition_no, t.po_no, t.status, t.remarks, t.total_amount,
      t.supplier_id, t.created_at, t.created_by, t.approved_by, t.updated_at,
      t.ship_via, t.ship_method,
      coalesce(items.items, '[]'::jsonb) as items,
      count(*) over() as total_count
    from transactions t
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id',                     ti.id,
        'product_id',             ti.product_id,
        'qty_stock_in',           ti.qty_stock_in,
        'actual_count_stock_in',  ti.actual_count_stock_in,
        'product_name',           p.product_name,
        'unit',                   p.unit,
        'cost_price',             p.cost_price,
        'selling_price',          p.selling_price,
        'sku',                    p.sku,
        'supplier_id',            p.supplier_id,
        'supplier_name',          s.name
      ) order by ti.id) as items
      from transaction_items ti
      left join products  p on p.id = ti.product_id
      left join suppliers s on s.id = p.supplier_id
      where ti.transaction_id = t.id
    ) items on true
    where t.po_no is not null
      -- Purchasing-only: transactions.po_no is overloaded — In-House orders now
      -- carry a DERIVED PO-YYYY-### in po_no too (same format as Purchasing's own
      -- series), so filtering on po_no alone leaks inhouse_order rows into the PO
      -- list. Constrain to purchasing document types.
      and t.transaction_type in ('purchase_order', 'stock_in')
      and ($1 is null or (
        t.requisition_no ilike '%%' || $1 || '%%' or
        t.po_no           ilike '%%' || $1 || '%%' or
        t.remarks         ilike '%%' || $1 || '%%' or
        t.status          ilike '%%' || $1 || '%%'
      ))
      and ($2 is null or t.status = any($2))
    order by %I %s
    limit $3 offset $4
    $f$,
    v_order_by, case when p_ascending then 'asc' else 'desc' end
  )
  using p_search, p_status, p_limit, p_offset;
end;
$$;