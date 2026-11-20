-- RPC: IN/OUT stock movement history for a single product.
--
-- Quick fetch para sa Products -> "View transaction history": usa ra ka
-- round-trip (transaction_items joined sa transactions, plus
-- pos_sale_details.voided_at para ma-ila ang voided POS sale). Ang movement
-- classification naka-encode na dire sa SQL aron dili na mag-filter pa sa JS.
--
-- IN  movements:
--   1. stock_in                                -> PO received -> main warehouse
--   2. stock_transfer (status = 'completed')   -> received -> branch
--   3. sales_return                            -> returned items
--   4. sale (pos_sale_details.voided_at NOT NULL) -> back to branch
--   5. ethical_order (status = 'cancelled')    -> stock restored
--
-- OUT movements:
--   1. stock_transfer (status in approved/completed) -> from main warehouse
--      (ang 'completed' gi-apil kay kini nagpasabot nga na-approve na usab ang
--       transfer -> ang OUT nahitabo na; ang IN branch na ang mo-cover sa
--       pag-receive sa branch)
--   2. sale (POS sale -> branch; dili voided)
--   3. ethical_order (status in invoiced/partial/paid) -> order fulfilled
--   4. inhouse_order (status in delivered/partial/paid) -> delivered
--   5. sale with remarks 'Settles%'             -> replacement given (sales return)
--   6. disposal (status = 'approved')           -> expired/damaged

create or replace function get_product_transaction_movements(
  p_product_id bigint,
  p_limit int default 500,
  p_offset int default 0
)
returns table (
  id bigint,
  transaction_id bigint,
  transaction_type text,
  status text,
  document_no text,
  movement text,
  qty numeric,
  unit_price numeric,
  line_total numeric,
  movement_at timestamptz,
  created_at timestamptz,
  warehouse_id bigint,
  outlet text,
  remarks text,
  reason text,
  total_count bigint
)
language sql
stable
as $$
  with movements as (
    select
      ti.id as id,
      t.id as transaction_id,
      t.transaction_type,
      t.status,
      -- Per-type document number (parehas sa reference-label scheme sa logs).
      case t.transaction_type
        when 'stock_in'       then coalesce(t.po_no, t.reference_no)
        when 'stock_transfer' then t.transfer_no
        when 'sale'           then t.sale_no
        when 'sales_return'   then t.sales_return_no
        when 'ethical_order'  then t.ethical_no
        when 'inhouse_order'  then t.inhouse_no
        when 'disposal'       then t.reference_no
        else t.reference_no
      end as document_no,
      t.warehouse_id,
      -- Branch label — ang transactions table nag-hold ra sa outlet_id,
      -- mao nga i-join sa outlets aron makita ang code/name sa branch.
      o.code as outlet,
      t.remarks,
      t.created_at,
      t.approved_at,
      t.received_at,
      t.updated_at,
      ti.qty_stock_in,
      ti.qty_stock_out,
      ti.actual_count_stock_in,
      ti.actual_count_stock_out,
      ti.unit_price,
      ti.line_total,
      -- Scalar subquery (dili join) aron walay duplication bisan pila ka
      -- pos_sale_details rows ang naa sa usa ka sale.
      (select psd.voided_at from pos_sale_details psd where psd.transaction_id = t.id limit 1) as voided_at
    from transaction_items ti
    join transactions t on t.id = ti.transaction_id
    left join outlets o on o.id = t.outlet_id
    where ti.product_id = p_product_id
  )
  select
    c.id,
    c.transaction_id,
    c.transaction_type,
    c.status,
    c.document_no,
    c.movement,
    c.qty,
    c.unit_price,
    c.line_total,
    c.movement_at,
    c.created_at,
    c.warehouse_id,
    c.outlet,
    c.remarks,
    c.reason,
    count(*) over() as total_count
  from (
    -- ════ IN movements ════
    -- 1. PO received -> main warehouse
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'IN' as movement,
      coalesce(m.actual_count_stock_in, m.qty_stock_in, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.received_at, m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'PO received -> main warehouse' as reason
    from movements m
    where m.transaction_type = 'stock_in'
      and coalesce(m.actual_count_stock_in, m.qty_stock_in, 0) > 0

    union all

    -- 2. Stock transfer received -> branch
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'IN' as movement,
      coalesce(m.actual_count_stock_out, m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.received_at, m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'Transfer received -> branch' as reason
    from movements m
    where m.transaction_type = 'stock_transfer'
      and m.status = 'completed'
      and coalesce(m.actual_count_stock_out, m.qty_stock_out, 0) > 0

    union all

    -- 3. Sales return -> returned items
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'IN' as movement,
      coalesce(m.qty_stock_in, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'Returned items' as reason
    from movements m
    where m.transaction_type = 'sales_return'
      and coalesce(m.qty_stock_in, 0) > 0

    union all

    -- 4. Voided POS sale -> stock back to branch
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'IN' as movement,
      coalesce(m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.voided_at, m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'Voided sale - stock restored to branch' as reason
    from movements m
    where m.transaction_type = 'sale'
      and m.voided_at is not null
      and coalesce(m.qty_stock_out, 0) > 0

    union all

    -- 5. Cancelled ethical order -> stock restored
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'IN' as movement,
      coalesce(m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'Cancelled order - stock restored' as reason
    from movements m
    where m.transaction_type = 'ethical_order'
      and m.status = 'cancelled'
      and coalesce(m.qty_stock_out, 0) > 0

    union all

    -- ════ OUT movements ════
    -- 1. Stock transfer approved -> from main warehouse
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'OUT' as movement,
      coalesce(m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.approved_at, m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'Transfer from main warehouse' as reason
    from movements m
    where m.transaction_type = 'stock_transfer'
      and m.status in ('approved', 'completed')
      and coalesce(m.qty_stock_out, 0) > 0

    union all

    -- 2. POS sale -> branch
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'OUT' as movement,
      coalesce(m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      m.created_at as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      case when m.remarks ilike 'Settles%'
        then 'Replacement given (sales return)'
        else 'POS sale - branch'
      end as reason
    from movements m
    where m.transaction_type = 'sale'
      and m.voided_at is null
      and coalesce(m.qty_stock_out, 0) > 0

    union all

    -- 3. Ethical order fulfilled
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'OUT' as movement,
      coalesce(m.actual_count_stock_out, m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.approved_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'Ethical order - fulfilled' as reason
    from movements m
    where m.transaction_type = 'ethical_order'
      and m.status in ('invoiced', 'partial', 'paid')
      and coalesce(m.actual_count_stock_out, m.qty_stock_out, 0) > 0

    union all

    -- 4. In-House order delivered
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'OUT' as movement,
      coalesce(m.actual_count_stock_out, m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'In-House order delivered' as reason
    from movements m
    where m.transaction_type = 'inhouse_order'
      and m.status in ('delivered', 'partial', 'paid')
      and coalesce(m.actual_count_stock_out, m.qty_stock_out, 0) > 0

    union all

    -- 6. Disposal approved -> expired/damaged
    select
      m.id, m.transaction_id, m.transaction_type, m.status, m.document_no,
      'OUT' as movement,
      coalesce(m.qty_stock_out, 0) as qty,
      m.unit_price, m.line_total,
      coalesce(m.approved_at, m.updated_at, m.created_at) as movement_at,
      m.created_at, m.warehouse_id, m.outlet, m.remarks,
      'Disposal - expired/damaged' as reason
    from movements m
    where m.transaction_type = 'disposal'
      and m.status = 'approved'
      and coalesce(m.qty_stock_out, 0) > 0
  ) c
  order by c.movement_at desc, c.id desc
  limit coalesce(p_limit, 500)
  offset coalesce(p_offset, 0);
$$;
