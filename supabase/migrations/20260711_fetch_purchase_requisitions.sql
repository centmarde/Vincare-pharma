-- RPC to fetch Purchase Requisitions for the PR list.
-- A PR-originated row carries its number in reference_no while it's still a
-- live requisition (transaction_type='purchase_requisition'), then that
-- number migrates into requisition_no once issued into a PO — see
-- issuePurchaseOrder(). Filtering/searching must check both columns to catch
-- the full lifecycle; coalesce() covers display.
create or replace function fetch_purchase_requisitions(
  p_search    text    default null,
  p_status    text[]  default null,
  p_order_by  text    default 'created_at',
  p_ascending boolean default false,
  p_limit     int     default 10,
  p_offset    int     default 0
)
returns table (
  id                     bigint,
  requisition_no         text,
  po_no                  text,
  reference_no           text,
  status                 text,
  remarks                text,
  total_amount           numeric,
  supplier_id            bigint,
  created_at             timestamptz,
  created_by             uuid,
  approved_by            uuid,
  updated_at             timestamptz,
  items                  jsonb,
  total_count            bigint
)
language plpgsql
stable
as $$
declare
  v_order_by text;
begin
  -- whitelist to prevent injection via dynamic ORDER BY
  v_order_by := case p_order_by
    when 'created_at'     then 'created_at'
    when 'total_amount'   then 'total_amount'
    when 'status'         then 'status'
    when 'requisition_no' then 'requisition_no'
    else 'created_at'
  end;

  return query execute format(
    $f$
    select
      t.id,
      -- Fresh, unissued PRs have their number in reference_no, not
      -- requisition_no (that only gets populated on issue). Coalesce so the
      -- caller always gets the right display value regardless of stage.
      coalesce(t.requisition_no, t.reference_no) as requisition_no,
      -- Once issued the PO number lives in reference_no until receipt (when
      -- it archives into po_no). Surface it here too so the PR list can show
      -- "PO-2026-004 (issued)" before receipt, not just after.
      coalesce(t.po_no, case when t.transaction_type = 'purchase_order' then t.reference_no end) as po_no,
      t.reference_no,
      t.status, t.remarks, t.total_amount,
      t.supplier_id, t.created_at, t.created_by, t.approved_by, t.updated_at,
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
        'expiry_date',            p.expiry_date,
        'supplier_name',          s.name
      ) order by ti.id) as items
      from transaction_items ti
      left join products  p on p.id = ti.product_id
      left join suppliers s on s.id = p.supplier_id
      where ti.transaction_id = t.id
    ) items on true
    -- A row belongs in the PR list if a PR number is sitting in EITHER
    -- column — reference_no (still a live requisition) or requisition_no
    -- (already issued/received, archived here). Replaces the old
    -- `requisition_no is not null`, which silently excluded every
    -- not-yet-issued PR.
    where (t.reference_no ilike 'PR%%' or t.requisition_no ilike 'PR%%')
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