-- RPC to fetch Purchase Orders for the PO list.
-- A PO-originated row carries its number in reference_no while issued but
-- not yet received (status='issued'), then that number migrates into po_no
-- once received — see markPOAsReceived(). Filtering/searching must check
-- both columns, or a freshly issued PO (pre-receipt) disappears from the list.
create or replace function new_fetch_purchase_orders(
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
      t.id, t.requisition_no,
      -- PO number lives in reference_no while issued-but-unreceived, and
      -- archives into po_no on receipt. Coalesce so the list always shows
      -- the current PO number regardless of which side of receipt it's on.
      coalesce(t.po_no, t.reference_no) as po_no,
      t.reference_no,
      t.status, t.remarks, t.total_amount,
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
    -- A row belongs in the PO list if a PO number is sitting in EITHER
    -- column — reference_no (issued, awaiting receipt) or po_no (received,
    -- archived here). Replaces the old `po_no is not null`, which silently
    -- excluded every issued-but-unreceived PO.
    where (t.reference_no ilike 'PO%%' or t.po_no ilike 'PO%%')
      -- Purchasing-only: In-House orders also derive a PO-YYYY-### number,
      -- so this type constraint is still required to keep them out.
      and t.transaction_type in ('purchase_order', 'stock_in')
      and ($1 is null or (
        t.requisition_no ilike '%%' || $1 || '%%' or
        t.po_no           ilike '%%' || $1 || '%%' or
        t.reference_no    ilike '%%' || $1 || '%%' or
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