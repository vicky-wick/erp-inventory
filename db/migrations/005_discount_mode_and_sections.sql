-- 005: percent discounts on sales + multiple business sections per workspace

-- ---------------------------------------------------------------- discounts
-- `discount` stays the authoritative absolute amount in paise (reports and
-- the ledger already use it). `discount_type` + `discount_value` keep what the
-- user actually typed: value is paise for 'amount' and basis points for
-- 'percent' (10% = 1000), so 12.5% stays exact.
alter table sales add column if not exists discount_type text not null default 'amount'
  check (discount_type in ('amount', 'percent'));
alter table sales add column if not exists discount_value bigint not null default 0;

update sales
   set discount_value = discount
 where discount_type = 'amount' and discount_value = 0 and discount > 0;

-- ------------------------------------------------------ business sections
-- A shop can be several things at once (bags *and* eyewear). `business_type`
-- stays as the primary section for existing code and display, while
-- `business_types` holds the full selection.
alter table workspaces add column if not exists business_types text[] not null default '{}';

update workspaces
   set business_types = array[business_type]
 where cardinality(business_types) = 0;

create index if not exists idx_workspaces_business_types
  on workspaces using gin (business_types);

-- ------------------------------------------------- record_sale (percent aware)
-- Signature grows by two defaulted params, so the old 10-argument call still
-- resolves. Dropped first because Postgres cannot change an argument list with
-- CREATE OR REPLACE.
drop function if exists record_sale(uuid, jsonb, bigint, payment_method, text, text, text, boolean, text, integer);

create function record_sale(
  p_workspace_id   uuid,
  p_items          jsonb,
  p_discount       bigint,
  p_payment_method payment_method,
  p_customer_name  text,
  p_customer_phone text,
  p_notes          text,
  p_allow_negative boolean,
  p_sale_prefix    text,
  p_next_seq       integer,
  p_discount_type  text default 'amount',
  p_discount_value bigint default 0
) returns jsonb as $$
declare
  v_sale_id uuid;
  v_sale_no text;
  v_item jsonb;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_count integer := 0;
  v_line_total bigint;
  v_type text := case when p_discount_type = 'percent' then 'percent' else 'amount' end;
  v_value bigint := greatest(coalesce(p_discount_value, 0), 0);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_SALE';
  end if;

  if v_type = 'percent' and v_value > 10000 then
    raise exception 'INVALID_DISCOUNT';
  end if;

  v_sale_no := p_sale_prefix || '-' || lpad(p_next_seq::text, 5, '0');

  insert into sales (
    workspace_id, sale_no, customer_name, customer_phone,
    discount, discount_type, discount_value,
    total, payment_method, payment_status, status, notes, created_by
  ) values (
    p_workspace_id, v_sale_no, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    0, v_type, v_value,
    0, p_payment_method, 'paid', 'completed', nullif(trim(p_notes), ''), app_user_id()
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_line_total := (v_item->>'quantity')::integer::bigint * (v_item->>'unit_price')::bigint;
    v_subtotal := v_subtotal + v_line_total;
    v_count := v_count + 1;

    insert into sale_items (
      sale_id, workspace_id, product_id, variant_id,
      product_name, variant_name, sku, quantity, returned_qty,
      unit_price, line_total
    ) values (
      v_sale_id, p_workspace_id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id','')::uuid,
      v_item->>'product_name',
      nullif(v_item->>'variant_name',''),
      v_item->>'sku',
      (v_item->>'quantity')::integer,
      0,
      (v_item->>'unit_price')::bigint,
      v_line_total
    );

    perform apply_stock_change(
      p_workspace_id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id','')::uuid,
      'sale_completed',
      -((v_item->>'quantity')::integer),
      'sale', v_sale_id,
      null, null,
      p_allow_negative
    );
  end loop;

  -- Percentage discounts are computed from the real subtotal inside the
  -- transaction, so the stored amount always matches the line items.
  if v_type = 'percent' then
    v_discount := round(v_subtotal::numeric * v_value / 10000.0)::bigint;
  else
    v_discount := greatest(coalesce(p_discount, 0), v_value);
  end if;

  if v_discount > v_subtotal then
    raise exception 'DISCOUNT_EXCEEDS_SUBTOTAL';
  end if;

  update sales
     set subtotal = v_subtotal,
         discount = v_discount,
         total    = v_subtotal - v_discount,
         items_count = v_count
   where id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'sale_no', v_sale_no,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'discount_type', v_type,
    'discount_value', v_value,
    'total', v_subtotal - v_discount
  );
end;
$$ language plpgsql;

-- ------------------------------------------ create_workspace (multi-section)
drop function if exists create_workspace(uuid, text, text, text, text, text, text[]);

create function create_workspace(
  p_owner_id       uuid,
  p_name           text,
  p_business_type  text,
  p_logo_url       text,
  p_currency       text,
  p_phone          text,
  p_modules        text[],
  p_business_types text[] default null
) returns uuid as $$
declare
  v_ws uuid;
  v_types text[] := coalesce(p_business_types, array[]::text[]);
begin
  if cardinality(v_types) = 0 then
    v_types := array[p_business_type];
  end if;

  insert into workspaces (name, business_type, business_types, logo_url, currency, phone, owner_id)
  values (trim(p_name), v_types[1], v_types, p_logo_url, p_currency, nullif(trim(p_phone),''), p_owner_id)
  returning id into v_ws;

  insert into workspace_members (workspace_id, user_id, role)
  values (v_ws, p_owner_id, 'owner');

  insert into workspace_settings (workspace_id) values (v_ws);

  insert into workspace_modules (workspace_id, module_key, enabled)
  select v_ws, m.module_key, m.enabled
  from (values
    ('dashboard', true),
    ('inventory', true),
    ('sales',     coalesce('sales'     = any(p_modules), true)),
    ('purchases', coalesce('purchases' = any(p_modules), false)),
    ('categories',coalesce('categories'= any(p_modules), true)),
    ('suppliers', coalesce('suppliers' = any(p_modules), false)),
    ('reports',   coalesce('reports'   = any(p_modules), false)),
    ('adjustments',coalesce('adjustments' = any(p_modules), false))
  ) as m(module_key, enabled);

  return v_ws;
end;
$$ language plpgsql;
