-- ============================================================================
-- gl_project_events: book a collection to the account it was deposited into
-- (2026-08-13)
--
-- SUPERSEDES supabase/migrations/20260727_fix_gl_project_events_void_guard.sql
-- -- that migration was written but never applied, so this file carries its
-- void guards forward as well. Run THIS one; do not run both.
--
-- CHANGE 1 (new here) -- the collections loop derived the cash account from
-- payment_method:
--     case when payment_method in ('cash','petty_cash') then '1010' else '1020' end
-- so every non-cash payment landed in 1020 with no record of WHICH bank
-- account received it, making bank reconciliation of 1020 impossible. It now
-- reads collections.cash_account_id -> cash_accounts.classification:
--     PETTY_CASH -> 1010 | TIME_INVESTMENT -> 1100 | anything else -> 1020
-- falling back to the old payment_method guess for collections recorded before
-- that column existed.
--
-- CHANGE 2 (carried from 20260727) -- void guards. The expense,
-- supplier-payment and collection loops filtered only on transaction_type, so
-- a document voided between being recorded and the next manual resync got
-- booked as live and never reversed (opex/AP overstated, cash understated,
-- permanently, unflagged). Guards added:
--   * expense / supplier_payment / stock_in -> and t.status <> 'voided'
--   * collections                           -> and voided_at is null
--
-- ONLY FUTURE POSTINGS ARE AFFECTED. The projector skips any document that
-- already has a journal entry, so nothing already booked is re-posted or
-- corrected. Documents mis-booked by an earlier resync, and collections
-- already booked to a guessed account, stay as they are -- fixing those is an
-- accountant decision.
--
-- BEFORE APPLYING, confirm you are not clobbering a newer definition:
--     select prosrc from pg_proc where proname = 'gl_project_events';
-- It should match 20260723000000 (i.e. no void guards, and the
-- payment_method-based v_cash above). If it does not, reconcile by hand
-- instead of running this create-or-replace.
--
-- Documents ALREADY mis-booked by a pre-fix resync are not auto-corrected --
-- reversing them is an accountant decision. To find them:
--   select je.id, je.entry_no, je.entry_date, je.reference_type, t.id, t.status
--   from journal_entries je
--   join transactions t on t.id = je.reference_id
--   where je.reference_type = 'disbursement' and je.status = 'posted'
--     and je.reverses_entry is null and t.status = 'voided';
--   select je.id, je.entry_no, je.entry_date, c.id, c.voided_at
--   from journal_entries je
--   join collections c on c.id = je.reference_id
--   where je.reference_type = 'collection' and je.status = 'posted'
--     and je.reverses_entry is null and c.voided_at is not null;
--
-- Gitignored -- run manually in the Supabase SQL editor per repo convention.
-- ============================================================================

create or replace function public.gl_project_events(
  p_from date default null,
  p_to   date default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, date '1970-01-01');
  v_to   date := coalesce(p_to, current_date);
  v_posted int := 0;
  r record;
  v_cogs numeric;
  v_cash text;
  v_subtotal numeric;
  v_lines jsonb;
  v_debit_acct text;
  v_orig_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('gl_project_events'));

  -- POS sale (completed, not voided): DR Cash / CR Revenue [+ DR COGS / CR Inventory]
  for r in
    select t.id, t.created_at, t.total_amount, d.payment_method, d.voided_at
    from transactions t
    left join pos_sale_details d on d.transaction_id = t.id
    where t.transaction_type = 'sale' and t.status = 'completed'
      and t.created_at::date between v_from and v_to
  loop
    if r.voided_at is not null then continue; end if;
    if exists (select 1 from journal_entries where reference_type='sales_invoice' and reference_id=r.id) then continue; end if;
    begin
      v_cogs := gl_sum_cost(r.id, 'qty', false);
      v_cash := case when r.payment_method in ('cash','petty_cash') then '1010' else '1020' end;
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', v_cash, 'debit', coalesce(r.total_amount,0), 'credit', 0),
        jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', coalesce(r.total_amount,0))
      );
      if v_cogs > 0 then
        v_lines := v_lines
          || jsonb_build_object('account_code','5010','debit',v_cogs,'credit',0)
          || jsonb_build_object('account_code','1040','debit',0,'credit',v_cogs);
      end if;
      perform gl_post_entry(r.created_at::date, 'sales_invoice', r.id, 'POS sale', v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: POS sale % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- POS void: reverse the sale's entry
  for r in
    select t.id, d.voided_at
    from transactions t
    join pos_sale_details d on d.transaction_id = t.id
    where t.transaction_type = 'sale' and d.voided_at is not null
      and d.voided_at::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='sales_return' and reference_id=r.id) then continue; end if;
    select id into v_orig_id from journal_entries
      where reference_type='sales_invoice' and reference_id=r.id and status='posted' limit 1;
    if v_orig_id is null then continue; end if;
    if gl_reverse_entry(v_orig_id, null, 'sales_return', r.id) is not null then v_posted := v_posted + 1; end if;
  end loop;

  -- Ethical order (not cancelled): DR AR / CR Revenue [+ discount] [+ COGS]
  -- NOTE: the rebate is deliberately NOT booked here. Under the payout-workflow
  -- model (see 20260717000003) the rebate is separate cash, accrued (DR 6030 /
  -- CR 2020) by ethicalData.recordCollection only when the order is PAID IN FULL,
  -- and settled (DR 2020 / CR cash) by payRebate. Booking it at invoice time too
  -- double-counted 6030 and overstated 4010 revenue.
  for r in
    select t.id, t.created_at, t.total_amount, d.discount_amount
    from transactions t
    left join ethical_details d on d.transaction_id = t.id
    where t.transaction_type = 'ethical_order' and t.status <> 'cancelled'
      and t.created_at::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='sales_invoice' and reference_id=r.id) then continue; end if;
    begin
      v_subtotal := coalesce(r.total_amount,0) + coalesce(r.discount_amount,0);
      v_cogs := gl_sum_cost(r.id, 'qty', false);
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','1030','debit',coalesce(r.total_amount,0),'credit',0),
        jsonb_build_object('account_code','4010','debit',0,'credit',v_subtotal)
      );
      if coalesce(r.discount_amount,0) > 0 then
        v_lines := v_lines || jsonb_build_object('account_code','6020','debit',r.discount_amount,'credit',0);
      end if;
      if v_cogs > 0 then
        v_lines := v_lines
          || jsonb_build_object('account_code','5010','debit',v_cogs,'credit',0)
          || jsonb_build_object('account_code','1040','debit',0,'credit',v_cogs);
      end if;
      perform gl_post_entry(r.created_at::date, 'sales_invoice', r.id, 'Ethical order invoice', v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: ethical order % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- Ethical order cancellation: reverse the invoice
  for r in
    select t.id, coalesce(t.updated_at, t.created_at) as event_at
    from transactions t
    where t.transaction_type = 'ethical_order' and t.status = 'cancelled'
      and coalesce(t.updated_at, t.created_at)::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='sales_return' and reference_id=r.id) then continue; end if;
    select id into v_orig_id from journal_entries
      where reference_type='sales_invoice' and reference_id=r.id and status='posted' limit 1;
    if v_orig_id is null then continue; end if;
    if gl_reverse_entry(v_orig_id, null, 'sales_return', r.id) is not null then v_posted := v_posted + 1; end if;
  end loop;

  -- Collections: DR Cash / CR AR
  -- Voided collections are skipped, not booked-then-reversed: a collection
  -- voided before its first projection was never in the ledger, so there is
  -- nothing to reverse and the change-request void path already returned ok.
  for r in
    select c.id, c.created_at, c.amount, c.payment_method, ca.classification
    from collections c
    left join cash_accounts ca on ca.id = c.cash_account_id
    where c.voided_at is null
      and c.created_at::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='collection' and reference_id=r.id) then continue; end if;
    begin
      -- The account the payment was actually deposited into decides the GL
      -- cash account. The old payment_method guess could not distinguish one
      -- bank account from another (a BDO transfer and a GCash payment both
      -- landed in 1020), which made reconciling 1020 impossible. Collections
      -- recorded before collections.cash_account_id existed have no account,
      -- so they keep the legacy guess.
      v_cash := case
        when r.classification = 'PETTY_CASH'      then '1010'
        when r.classification = 'TIME_INVESTMENT' then '1100'
        when r.classification is not null         then '1020'
        when r.payment_method in ('cash','petty_cash') then '1010'
        else '1020'
      end;
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', v_cash, 'debit', coalesce(r.amount,0), 'credit', 0),
        jsonb_build_object('account_code', '1030', 'debit', 0, 'credit', coalesce(r.amount,0))
      );
      perform gl_post_entry(r.created_at::date, 'collection', r.id, 'Collection received', v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: collection % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- In-house order delivered/paid/partial (partial = delivered, first payment
  -- was less than total — a payment sub-state, not a delivery sub-state; see
  -- header note): DR AR / CR Revenue [+ COGS from actual delivered qty]
  for r in
    select t.id, coalesce(t.updated_at, t.created_at) as event_at, t.total_amount
    from transactions t
    where t.transaction_type = 'inhouse_order' and t.status in ('delivered','paid','partial')
      and coalesce(t.updated_at, t.created_at)::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='sales_invoice' and reference_id=r.id) then continue; end if;
    begin
      v_cogs := gl_sum_cost(r.id, 'delivered_qty', true);
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','1030','debit',coalesce(r.total_amount,0),'credit',0),
        jsonb_build_object('account_code','4010','debit',0,'credit',coalesce(r.total_amount,0))
      );
      if v_cogs > 0 then
        v_lines := v_lines
          || jsonb_build_object('account_code','5010','debit',v_cogs,'credit',0)
          || jsonb_build_object('account_code','1040','debit',0,'credit',v_cogs);
      end if;
      perform gl_post_entry(r.event_at::date, 'sales_invoice', r.id, 'In-house order delivered', v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: in-house order % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- Stock-in received: DR Inventory / CR AP
  for r in
    select t.id, coalesce(t.updated_at, t.created_at) as event_at, t.total_amount
    from transactions t
    where t.transaction_type = 'stock_in' and t.status <> 'voided'
      and coalesce(t.updated_at, t.created_at)::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='purchase_invoice' and reference_id=r.id) then continue; end if;
    begin
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','1040','debit',coalesce(r.total_amount,0),'credit',0),
        jsonb_build_object('account_code','2010','debit',0,'credit',coalesce(r.total_amount,0))
      );
      perform gl_post_entry(r.event_at::date, 'purchase_invoice', r.id, 'Stock received', v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: stock-in % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- Supplier payment: DR AP / CR Cash
  for r in
    select t.id, coalesce(t.paid_at, t.created_at) as event_at, t.total_amount, ca.account_type
    from transactions t
    left join cash_accounts ca on ca.id = t.cash_account_id
    where t.transaction_type = 'supplier_payment' and t.status <> 'voided'
      and coalesce(t.paid_at, t.created_at)::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='disbursement' and reference_id=r.id) then continue; end if;
    begin
      v_cash := case when r.account_type = 'petty_cash' then '1010' else '1020' end;
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','2010','debit',coalesce(r.total_amount,0),'credit',0),
        jsonb_build_object('account_code', v_cash, 'debit', 0, 'credit', coalesce(r.total_amount,0))
      );
      perform gl_post_entry(r.event_at::date, 'disbursement', r.id, 'Supplier payment', v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: supplier payment % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- Expense: DR <category account> / CR <cash account>
  for r in
    select t.id, coalesce(t.paid_at, t.created_at) as event_at, t.total_amount,
           fd.category, ca.account_type
    from transactions t
    left join finance_details fd on fd.transaction_id = t.id
    left join cash_accounts ca on ca.id = t.cash_account_id
    where t.transaction_type = 'expense' and t.status <> 'voided'
      and coalesce(t.paid_at, t.created_at)::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='disbursement' and reference_id=r.id) then continue; end if;
    begin
      v_cash := case when r.account_type = 'petty_cash' then '1010' else '1020' end;
      v_debit_acct := case r.category
        when 'rent' then '7130' when 'utilities' then '7270' when 'supplies' then '7080'
        when 'maintenance' then '7150' when 'transportation' then '7250'
        when 'taxes_fees' then '7240' when 'taxes_licenses' then '7240'
        when 'representation' then '6040' when 'fuel_lubricants' then '7050'
        when 'labor_services' then '7070' when 'freight_handling' then '5030'
        else '7080' end;
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', v_debit_acct, 'debit', coalesce(r.total_amount,0), 'credit', 0),
        jsonb_build_object('account_code', v_cash, 'debit', 0, 'credit', coalesce(r.total_amount,0))
      );
      perform gl_post_entry(r.event_at::date, 'disbursement', r.id, 'Expense: ' || coalesce(r.category, 'other'), v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: expense % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- Petty-cash replenishment (approved): DR Petty Cash / CR Bank
  for r in
    select t.id, coalesce(t.approved_at, t.created_at) as event_at, t.total_amount
    from transactions t
    where t.transaction_type = 'petty_cash_replenishment' and t.status = 'approved'
      and coalesce(t.approved_at, t.created_at)::date between v_from and v_to
  loop
    if exists (select 1 from journal_entries where reference_type='manual' and reference_id=r.id) then continue; end if;
    begin
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code','1010','debit',coalesce(r.total_amount,0),'credit',0),
        jsonb_build_object('account_code','1020','debit',0,'credit',coalesce(r.total_amount,0))
      );
      perform gl_post_entry(r.event_at::date, 'manual', r.id, 'Petty cash replenishment', v_lines, null);
      v_posted := v_posted + 1;
    exception when others then
      raise warning 'gl_project_events: petty cash replenishment % failed: %', r.id, sqlerrm;
    end;
  end loop;

  return v_posted;
end $$;

grant execute on function public.gl_project_events(date, date)
  to anon, authenticated, service_role;
