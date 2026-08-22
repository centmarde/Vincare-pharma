create or replace function fetch_customers_rpc(
  p_department text default null,
  p_include_unassigned boolean default false,
  p_search text default null,
  p_page int default 1,
  p_page_size int default 10
)
returns table (
  id bigint,
  created_at timestamptz,
  name text,
  agency_type text,
  contact_person text,
  contact_no text,
  email text,
  address text,
  is_active boolean,
  department text,
  agent_id bigint,
  is_vat_registered boolean,
  tin_number text,
  business_structure text,
  sec_registration_no text,
  dti_registration_no text,
  name_of_pmr text,
  area text,
  rebate_payment_mode text,
  rebate_payment_account_no text,
  scheme text[],
  term_days text,
  product_sales_list text,
  owner_name text,
  owner_contact_no text,
  purchaser_name text,
  purchaser_contact_no text,
  target_sales text,
  discount_rate numeric,
  rebate_rate numeric,
  markup_percent numeric,
  rebate_ratio_distribution text,
  category text,
  price_offered text,
  receipt_details text,
  recipients_name text,
  payment_method text,
  is_inquire boolean,
  remarks text,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
as $$
  select
    c.id, c.created_at, c.name, c.agency_type, c.contact_person, c.contact_no,
    c.email, c.address, c.is_active, c.department, c.agent_id,
    c.is_vat_registered, c.tin_number, c.business_structure,
    c.sec_registration_no, c.dti_registration_no, c.name_of_pmr, c.area,
    c.rebate_payment_mode, c.rebate_payment_account_no, c.scheme, c.term_days,
    c.product_sales_list, c.owner_name, c.owner_contact_no, c.purchaser_name,
    c.purchaser_contact_no, c.target_sales, c.discount_rate, c.rebate_rate,
    c.markup_percent, c.rebate_ratio_distribution, c.category, c.price_offered,
    c.receipt_details, c.recipients_name, c.payment_method, c.is_inquire,
    c.remarks, c.updated_at,
    count(*) over() as total_count
  from customers c
  where
    (
      p_department is null
      or c.department = p_department
      or (p_include_unassigned and c.department is null)
    )
    and (
      p_search is null
      or p_search = ''
      or c.name ilike '%' || p_search || '%'
      or c.contact_no ilike '%' || p_search || '%'
      or c.email ilike '%' || p_search || '%'
      or c.address ilike '%' || p_search || '%'
      or c.owner_name ilike '%' || p_search || '%'
      or c.tin_number ilike '%' || p_search || '%'
      or c.term_days ilike '%' || p_search || '%'
    )
  order by c.name asc nulls last
  limit p_page_size
  offset greatest(p_page - 1, 0) * p_page_size;
$$;