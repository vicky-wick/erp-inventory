-- =====================================================================
-- EVOLV — Retail Management System
-- Migration 001: schema, indexes, triggers, RLS, stock engine RPCs
-- Target: Neon PostgreSQL 16+
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------- enums ---------------------------------
create type member_role      as enum ('owner','admin','staff');
create type movement_type    as enum ('opening_stock','purchase_received','sale_completed','sale_returned','damage','missing','manual_adjustment','purchase_reversed','sale_reversed');
create type sale_status      as enum ('completed','partially_returned','returned','cancelled');
create type payment_method   as enum ('cash','upi','card','other');
create type payment_status   as enum ('paid','partially_refunded','refunded');
create type purchase_status  as enum ('draft','received','cancelled');
create type product_status   as enum ('active','archived');
create type field_type       as enum ('text','number','dropdown','boolean');

-- ---------------------------- identity ------------------------------
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text not null,
  name          text not null default '',
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index idx_password_resets_user on password_resets(user_id);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index idx_sessions_user    on sessions(user_id);
create index idx_sessions_expires on sessions(expires_at);

-- ---------------------------- workspaces ----------------------------
create table workspaces (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) between 1 and 80),
  business_type  text not null default 'general',
  logo_url       text,
  currency       text not null default 'INR' check (char_length(currency) = 3),
  phone          text,
  email          text,
  address        text,
  gstin          text,
  invoice_prefix text not null default 'INV',
  invoice_footer text,
  timezone       text not null default 'Asia/Kolkata',
  owner_id       uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         member_role not null default 'staff',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index idx_workspace_members_user on workspace_members(user_id);

create table workspace_settings (
  workspace_id         uuid primary key references workspaces(id) on delete cascade,
  low_stock_threshold  integer not null default 5 check (low_stock_threshold >= 0),
  auto_sku             boolean not null default true,
  allow_manual_sku     boolean not null default true,
  allow_negative_stock boolean not null default false,
  enable_variants      boolean not null default false,
  sku_prefix           text not null default 'SKU',
  sku_sequence         integer not null default 1,
  sale_sequence        integer not null default 1,
  purchase_sequence    integer not null default 1
);

create table workspace_modules (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  module_key   text not null,
  enabled      boolean not null default false,
  primary key (workspace_id, module_key),
  check (module_key in ('dashboard','inventory','sales','purchases','categories','suppliers','reports','adjustments'))
);

create table dashboard_preferences (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  widgets      jsonb not null default '{}',
  primary key (workspace_id, user_id)
);

-- ---------------------------- catalog -------------------------------
create table categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 60),
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

create table suppliers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 80),
  phone        text,
  email        text,
  address      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table products (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  sku            text not null,
  name           text not null check (length(trim(name)) between 1 and 120),
  brand          text,
  category_id    uuid references categories(id) on delete set null,
  supplier_id    uuid references suppliers(id) on delete set null,
  description    text,
  barcode        text,
  image_url      text,
  selling_price  bigint not null default 0 check (selling_price >= 0),
  purchase_price bigint not null default 0 check (purchase_price >= 0),
  stock_qty      integer not null default 0,
  min_stock      integer not null default 0 check (min_stock >= 0),
  has_variants   boolean not null default false,
  status         product_status not null default 'active',
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id, sku)
);
create unique index products_ws_barcode_uq on products(workspace_id, barcode) where barcode is not null;

create table product_variants (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  sku            text not null,
  name           text not null,
  attributes     jsonb not null default '{}',
  barcode        text,
  price_override bigint check (price_override >= 0),
  stock_qty      integer not null default 0,
  min_stock      integer not null default 0 check (min_stock >= 0),
  status         product_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id, sku),
  unique (product_id, name)
);
create unique index product_variants_ws_barcode_uq on product_variants(workspace_id, barcode) where barcode is not null;
create index idx_variants_product on product_variants(product_id);

create table custom_attribute_definitions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  key           text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  name          text not null,
  field_type    field_type not null default 'text',
  options       text[] not null default '{}',
  required      boolean not null default false,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, key)
);

create table product_attribute_values (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  attribute_id uuid not null references custom_attribute_definitions(id) on delete cascade,
  value        jsonb,
  created_at   timestamptz not null default now(),
  unique (product_id, attribute_id)
);

-- ---------------------------- transactions --------------------------
create table sales (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  sale_no        text not null,
  customer_name  text,
  customer_phone text,
  items_count    integer not null default 0,
  subtotal       bigint not null default 0 check (subtotal >= 0),
  discount       bigint not null default 0 check (discount >= 0),
  total          bigint not null default 0 check (total >= 0),
  payment_method payment_method not null default 'cash',
  payment_status payment_status not null default 'paid',
  status         sale_status not null default 'completed',
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id, sale_no)
);

create table sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references sales(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_id   uuid not null references products(id),
  variant_id   uuid references product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  sku          text not null,
  quantity     integer not null check (quantity > 0),
  returned_qty integer not null default 0 check (returned_qty >= 0),
  unit_price   bigint not null check (unit_price >= 0),
  line_total   bigint not null check (line_total >= 0),
  check (returned_qty <= quantity)
);

create table purchases (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  purchase_no   text not null,
  supplier_id   uuid references suppliers(id) on delete set null,
  invoice_no    text,
  purchase_date date not null default current_date,
  items_count   integer not null default 0,
  total         bigint not null default 0 check (total >= 0),
  status        purchase_status not null default 'draft',
  notes         text,
  received_at   timestamptz,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, purchase_no)
);

create table purchase_items (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references purchases(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_id   uuid not null references products(id),
  variant_id   uuid references product_variants(id) on delete set null,
  product_name text not null,
  sku          text not null,
  quantity     integer not null check (quantity > 0),
  unit_cost    bigint not null check (unit_cost >= 0),
  line_total   bigint not null check (line_total >= 0)
);

-- ---------------------------- stock ledger --------------------------
create table stock_movements (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  variant_id      uuid references product_variants(id) on delete cascade,
  movement_type   movement_type not null,
  quantity_change integer not null,
  previous_qty    integer not null,
  new_qty         integer not null,
  reference_type  text not null,
  reference_id    uuid,
  reason          text,
  note            text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- ---------------------------- indexes -------------------------------
create index idx_products_ws_status  on products(workspace_id, status);
create index idx_products_ws_name    on products(workspace_id, lower(name));
create index idx_products_category   on products(category_id);
create index idx_products_supplier   on products(supplier_id);
create index idx_categories_ws       on categories(workspace_id);
create index idx_suppliers_ws        on suppliers(workspace_id);
create index idx_sales_ws_date       on sales(workspace_id, created_at desc);
create index idx_sales_ws_status     on sales(workspace_id, status);
create index idx_sale_items_sale     on sale_items(sale_id);
create index idx_sale_items_product  on sale_items(workspace_id, product_id);
create index idx_purchases_ws_date   on purchases(workspace_id, purchase_date desc);
create index idx_purchase_items_purchase on purchase_items(purchase_id);
create index idx_movements_product   on stock_movements(workspace_id, product_id, created_at desc);
create index idx_movements_variant   on stock_movements(variant_id);
create index idx_movements_ws_date   on stock_movements(workspace_id, created_at desc);
create index idx_attr_values_product on product_attribute_values(product_id);
create index idx_attr_defs_ws        on custom_attribute_definitions(workspace_id);

-- ---------------------------- triggers ------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated   before update on profiles   for each row execute function set_updated_at();
create trigger trg_workspaces_updated before update on workspaces for each row execute function set_updated_at();
create trigger trg_categories_updated before update on categories for each row execute function set_updated_at();
create trigger trg_suppliers_updated  before update on suppliers  for each row execute function set_updated_at();
create trigger trg_products_updated   before update on products   for each row execute function set_updated_at();
create trigger trg_variants_updated   before update on product_variants for each row execute function set_updated_at();
create trigger trg_attr_defs_updated  before update on custom_attribute_definitions for each row execute function set_updated_at();
create trigger trg_sales_updated      before update on sales      for each row execute function set_updated_at();
create trigger trg_purchases_updated  before update on purchases  for each row execute function set_updated_at();

create or replace function sync_product_has_variants() returns trigger as $$
begin
  update products
     set has_variants = exists (
           select 1 from product_variants v
           where v.product_id = coalesce(new.product_id, old.product_id) and v.status = 'active')
   where id = coalesce(new.product_id, old.product_id);
  return null;
end;
$$ language plpgsql;

create trigger trg_variants_sync after insert or update or delete on product_variants
  for each row execute function sync_product_has_variants();

-- =====================================================================
-- SECURITY CONTEXT HELPERS
-- The API sets, per transaction:
--   set local app.user_id = '<uuid>';
--   set local app.workspace_id = '<uuid>';
--   set local app.system = 'on';  -- only for auth/registration paths
-- =====================================================================
create or replace function app_user_id() returns uuid as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$ language sql stable;

create or replace function app_workspace_id() returns uuid as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid;
$$ language sql stable;

create or replace function app_is_system() returns boolean as $$
  select coalesce(current_setting('app.system', true) = 'on', false);
$$ language sql stable;

create or replace function app_is_member(ws_id uuid) returns boolean as $$
  select app_is_system() or exists (
    select 1 from workspace_members m
    where m.workspace_id = ws_id and m.user_id = app_user_id());
$$ language sql stable security definer;

create or replace function app_role_in_ws(ws_id uuid, allowed text[]) returns boolean as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws_id and m.user_id = app_user_id() and m.role::text = any(allowed));
$$ language sql stable security definer;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table workspaces                    enable row level security;
alter table workspace_members             enable row level security;
alter table workspace_settings            enable row level security;
alter table workspace_modules             enable row level security;
alter table dashboard_preferences         enable row level security;
alter table categories                    enable row level security;
alter table suppliers                     enable row level security;
alter table products                      enable row level security;
alter table product_variants              enable row level security;
alter table custom_attribute_definitions  enable row level security;
alter table product_attribute_values      enable row level security;
alter table sales                         enable row level security;
alter table sale_items                    enable row level security;
alter table purchases                     enable row level security;
alter table purchase_items                enable row level security;
alter table stock_movements               enable row level security;

-- workspaces: read own memberships; update if owner/admin; create via system only
create policy ws_select on workspaces for select
  using (app_is_member(id) or owner_id = app_user_id());
create policy ws_update on workspaces for update
  using (owner_id = app_user_id() or app_role_in_ws(id, '{owner,admin}'));
create policy ws_system_all on workspaces for all
  using (app_is_system()) with check (app_is_system());

create policy wm_select on workspace_members for select
  using (app_is_member(workspace_id) or user_id = app_user_id());
create policy wm_system_all on workspace_members for all
  using (app_is_system()) with check (app_is_system());
create policy wm_manage_upd on workspace_members for update
  using (app_role_in_ws(workspace_id, '{owner,admin}'));
create policy wm_manage_del on workspace_members for delete
  using (app_role_in_ws(workspace_id, '{owner,admin}'));

create policy wset_all on workspace_settings for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));
create policy wmod_select on workspace_modules for select
  using (app_is_member(workspace_id));
create policy wmod_write on workspace_modules for all
  using (app_role_in_ws(workspace_id, '{owner,admin}'))
  with check (app_role_in_ws(workspace_id, '{owner,admin}'));

create policy dashpref_all on dashboard_preferences for all
  using (app_is_member(workspace_id) and (user_id = app_user_id() or app_is_system()))
  with check (app_is_member(workspace_id) and (user_id = app_user_id() or app_is_system()));

-- generic workspace-data policies
create policy cat_select on categories for select using (app_is_member(workspace_id));
create policy cat_write  on categories for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy sup_select on suppliers for select using (app_is_member(workspace_id));
create policy sup_write  on suppliers for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy prod_select on products for select
  using (app_is_member(workspace_id));
create policy prod_write  on products for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy var_select on product_variants for select using (app_is_member(workspace_id));
create policy var_write  on product_variants for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy attrdef_select on custom_attribute_definitions for select using (app_is_member(workspace_id));
create policy attrdef_write  on custom_attribute_definitions for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy attrval_select on product_attribute_values for select using (app_is_member(workspace_id));
create policy attrval_write  on product_attribute_values for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy sales_select on sales for select using (app_is_member(workspace_id));
create policy sales_write  on sales for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy saleitems_select on sale_items for select using (app_is_member(workspace_id));
create policy saleitems_write  on sale_items for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy purch_select on purchases for select using (app_is_member(workspace_id));
create policy purch_write  on purchases for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy purchitems_select on purchase_items for select using (app_is_member(workspace_id));
create policy purchitems_write  on purchase_items for all
  using (app_is_member(workspace_id)) with check (app_is_member(workspace_id));

create policy movements_select on stock_movements for select
  using (app_is_member(workspace_id));
create policy movements_write on stock_movements for insert
  with check (app_is_system() and app_is_member(workspace_id));

-- =====================================================================
-- STOCK ENGINE — concurrency-safe, ledger-backed, cached qty in sync
-- All run inside the caller's transaction. Row locks (FOR UPDATE)
-- prevent oversell; movement rows are written with cached quantity.
-- =====================================================================

-- Apply one stock change for a product/variant target. Returns new qty.
create or replace function apply_stock_change(
  p_workspace_id uuid,
  p_product_id   uuid,
  p_variant_id   uuid,
  p_type         movement_type,
  p_change       integer,
  p_reference_type text,
  p_reference_id   uuid,
  p_reason         text,
  p_note           text,
  p_allow_negative boolean
) returns integer as $$
declare
  v_prev integer;
  v_new  integer;
  v_is_variant boolean := p_variant_id is not null;
begin
  if v_is_variant then
    select stock_qty into v_prev from product_variants
     where id = p_variant_id and workspace_id = p_workspace_id
     for update;
    if v_prev is null then
      raise exception 'VARIANT_NOT_FOUND: %', p_variant_id;
    end if;
    v_new := v_prev + p_change;
    if v_new < 0 and not p_allow_negative then
      raise exception 'INSUFFICIENT_STOCK: available %, requested %', v_prev, -p_change;
    end if;
    update product_variants set stock_qty = v_new where id = p_variant_id;
  else
    select stock_qty into v_prev from products
     where id = p_product_id and workspace_id = p_workspace_id
     for update;
    if v_prev is null then
      raise exception 'PRODUCT_NOT_FOUND: %', p_product_id;
    end if;
    v_new := v_prev + p_change;
    if v_new < 0 and not p_allow_negative then
      raise exception 'INSUFFICIENT_STOCK: available %, requested %', v_prev, -p_change;
    end if;
    update products set stock_qty = v_new where id = p_product_id;
  end if;

  insert into stock_movements (
    workspace_id, product_id, variant_id, movement_type,
    quantity_change, previous_qty, new_qty,
    reference_type, reference_id, reason, note, created_by
  ) values (
    p_workspace_id, p_product_id, p_variant_id, p_type,
    p_change, v_prev, v_new,
    p_reference_type, p_reference_id, p_reason, p_note, app_user_id()
  );

  return v_new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- RECORD SALE (atomic)
-- items jsonb: [{"product_id","variant_id","product_name","variant_name","sku","quantity","unit_price"}]
-- ---------------------------------------------------------------------
create or replace function record_sale(
  p_workspace_id  uuid,
  p_items         jsonb,
  p_discount      bigint,
  p_payment_method payment_method,
  p_customer_name text,
  p_customer_phone text,
  p_notes         text,
  p_allow_negative boolean,
  p_sale_prefix   text,
  p_next_seq      integer
) returns jsonb as $$
declare
  v_sale_id uuid;
  v_sale_no text;
  v_item jsonb;
  v_subtotal bigint := 0;
  v_count integer := 0;
  v_line_total bigint;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_SALE';
  end if;

  v_sale_no := p_sale_prefix || '-' || lpad(p_next_seq::text, 5, '0');

  insert into sales (
    workspace_id, sale_no, customer_name, customer_phone,
    discount, total, payment_method, payment_status, status, notes, created_by
  ) values (
    p_workspace_id, v_sale_no, nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''),
    p_discount, 0, p_payment_method, 'paid', 'completed', nullif(trim(p_notes), ''), app_user_id()
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

  if p_discount > v_subtotal then
    raise exception 'DISCOUNT_EXCEEDS_SUBTOTAL';
  end if;

  update sales
     set subtotal = v_subtotal,
         total    = v_subtotal - p_discount,
         items_count = v_count
   where id = v_sale_id;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_no', v_sale_no, 'total', v_subtotal - p_discount);
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- RETURN SALE — full or partial, with stock restore
-- returns jsonb: [{product_id, variant_id, quantity}] qty negative => return all remaining
-- ---------------------------------------------------------------------
create or replace function return_sale(
  p_workspace_id uuid,
  p_sale_id      uuid,
  p_items        jsonb,
  p_reason       text
) returns jsonb as $$
declare
  v_item      jsonb;
  v_si        record;
  v_return_qty integer;
  v_any_return boolean := false;
  v_all_returned boolean := true;
begin
  select * into v_si from sales
   where id = p_sale_id and workspace_id = p_workspace_id
   for update;

  if v_si.id is null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if v_si.status = 'cancelled' then
    raise exception 'SALE_CANCELLED';
  end if;
  if v_si.status = 'returned' then
    raise exception 'SALE_ALREADY_RETURNED';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_si from sale_items
     where id = (v_item->>'item_id')::uuid
       and sale_id = p_sale_id and workspace_id = p_workspace_id
     for update;

    if v_si.id is null then
      raise exception 'SALE_ITEM_NOT_FOUND: %', v_item->>'item_id';
    end if;

    if (v_item->>'quantity') is null then
      v_return_qty := v_si.quantity - v_si.returned_qty; -- return all remaining
    else
      v_return_qty := (v_item->>'quantity')::integer;
    end if;

    if v_return_qty <= 0 or v_si.returned_qty + v_return_qty > v_si.quantity then
      raise exception 'INVALID_RETURN_QTY: item % remaining %', v_si.id, v_si.quantity - v_si.returned_qty;
    end if;

    update sale_items set returned_qty = returned_qty + v_return_qty where id = v_si.id;

    perform apply_stock_change(
      p_workspace_id, v_si.product_id, v_si.variant_id,
      'sale_returned', v_return_qty,
      'sale', p_sale_id, p_reason, null, true
    );

    v_any_return := true;
    if v_si.returned_qty + v_return_qty < v_si.quantity then
      v_all_returned := false;
    end if;
  end loop;

  if not v_any_return then
    raise exception 'EMPTY_RETURN';
  end if;

  update sales
     set status = case when v_all_returned then 'returned'::sale_status else 'partially_returned'::sale_status end,
         payment_status = case when v_all_returned then 'refunded'::payment_status else 'partially_refunded'::payment_status end
   where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id, 'status', case when v_all_returned then 'returned' else 'partially_returned' end);
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- RECEIVE PURCHASE — increases stock, updates product cost
-- ---------------------------------------------------------------------
create or replace function receive_purchase(
  p_workspace_id uuid,
  p_purchase_id  uuid
) returns void as $$
declare
  v_p record;
  v_it record;
begin
  select * into v_p from purchases
   where id = p_purchase_id and workspace_id = p_workspace_id
   for update;

  if v_p.id is null then
    raise exception 'PURCHASE_NOT_FOUND';
  end if;
  if v_p.status = 'received' then
    raise exception 'PURCHASE_ALREADY_RECEIVED';
  end if;
  if v_p.status = 'cancelled' then
    raise exception 'PURCHASE_CANCELLED';
  end if;

  for v_it in select * from purchase_items where purchase_id = p_purchase_id loop
    perform apply_stock_change(
      p_workspace_id, v_it.product_id, v_it.variant_id,
      'purchase_received', v_it.quantity,
      'purchase', p_purchase_id, null, null, true
    );

    update products set purchase_price = v_it.unit_cost
     where id = v_it.product_id and purchase_price = 0;
  end loop;

  update purchases
     set status = 'received', received_at = now()
   where id = p_purchase_id;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- CANCEL PURCHASE (draft only) / REVERSE RECEIVED PURCHASE
-- ---------------------------------------------------------------------
create or replace function reverse_purchase(
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_reason       text
) returns void as $$
declare
  v_p record;
  v_it record;
begin
  select * into v_p from purchases
   where id = p_purchase_id and workspace_id = p_workspace_id
   for update;

  if v_p.id is null then
    raise exception 'PURCHASE_NOT_FOUND';
  end if;

  if v_p.status = 'draft' then
    update purchases set status = 'cancelled' where id = p_purchase_id;
    return;
  end if;

  if v_p.status = 'cancelled' then
    raise exception 'PURCHASE_ALREADY_CANCELLED';
  end if;

  for v_it in select * from purchase_items where purchase_id = p_purchase_id loop
    perform apply_stock_change(
      p_workspace_id, v_it.product_id, v_it.variant_id,
      'purchase_reversed', -v_it.quantity,
      'purchase', p_purchase_id, p_reason, null, true
    );
  end loop;

  update purchases set status = 'cancelled' where id = p_purchase_id;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- MANUAL STOCK ADJUSTMENT
-- ---------------------------------------------------------------------
create or replace function adjust_stock(
  p_workspace_id uuid,
  p_product_id   uuid,
  p_variant_id   uuid,
  p_change       integer,
  p_reason       text,
  p_note         text
) returns integer as $$
declare
  v_new integer;
begin
  if p_reason not in ('damage','missing','correction','other') then
    raise exception 'INVALID_ADJUSTMENT_REASON';
  end if;
  if p_change = 0 then
    raise exception 'ZERO_ADJUSTMENT';
  end if;

  select apply_stock_change(
    p_workspace_id, p_product_id, p_variant_id,
    case when p_change > 0 then 'manual_adjustment' else p_reason::movement_type end,
    p_change, 'adjustment', null, p_reason, p_note, false
  ) into v_new;

  return v_new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- PRODUCT CREATE (with opening stock) — one call from the product form
-- attributes jsonb: [{attribute_id, value}]
-- variants jsonb:   [{sku, name, attributes, barcode, price_override, stock_qty}]
-- ---------------------------------------------------------------------
create or replace function create_product(
  p_workspace_id  uuid,
  p_sku           text,
  p_name          text,
  p_brand         text,
  p_category_id   uuid,
  p_supplier_id   uuid,
  p_description   text,
  p_barcode       text,
  p_image_url     text,
  p_selling_price bigint,
  p_purchase_price bigint,
  p_stock_qty     integer,
  p_min_stock     integer,
  p_attributes    jsonb,
  p_variants      jsonb
) returns uuid as $$
declare
  v_product_id uuid;
  v_attr jsonb;
  v_variant jsonb;
  v_has_variants boolean := p_variants is not null and jsonb_array_length(p_variants) > 0;
  v_variant_total integer := 0;
begin
  if v_has_variants and p_stock_qty <> 0 then
    raise exception 'VARIANT_PRODUCT_STOCK_AT_PRODUCT_LEVEL';
  end if;

  insert into products (
    workspace_id, sku, name, brand, category_id, supplier_id,
    description, barcode, image_url, selling_price, purchase_price,
    stock_qty, min_stock, has_variants, created_by
  ) values (
    p_workspace_id, trim(p_sku), trim(p_name), nullif(trim(p_brand), ''),
    p_category_id, p_supplier_id,
    nullif(trim(p_description), ''), nullif(trim(p_barcode), ''),
    p_image_url, p_selling_price, p_purchase_price,
    0, p_min_stock, v_has_variants, app_user_id()
  ) returning id into v_product_id;

  if not v_has_variants and p_stock_qty > 0 then
    perform apply_stock_change(
      p_workspace_id, v_product_id, null,
      'opening_stock', p_stock_qty, 'product', v_product_id,
      'opening', null, false
    );
  end if;

  if p_attributes is not null then
    for v_attr in select * from jsonb_array_elements(p_attributes) loop
      insert into product_attribute_values (workspace_id, product_id, attribute_id, value)
      values (p_workspace_id, v_product_id, (v_attr->>'attribute_id')::uuid, v_attr->'value');
    end loop;
  end if;

  if v_has_variants then
    for v_variant in select * from jsonb_array_elements(p_variants) loop
      insert into product_variants (
        workspace_id, product_id, sku, name, attributes, barcode,
        price_override, stock_qty, min_stock
      ) values (
        p_workspace_id, v_product_id, trim(v_variant->>'sku'), trim(v_variant->>'name'),
        coalesce(v_variant->'attributes', '{}'::jsonb), nullif(trim(v_variant->>'barcode'), ''),
        nullif(v_variant->>'price_override','')::bigint,
        0,
        coalesce(nullif(v_variant->>'min_stock','')::integer, 0)
      );

      if coalesce(nullif(v_variant->>'stock_qty','')::integer, 0) > 0 then
        perform apply_stock_change(
          p_workspace_id, v_product_id,
          (select id from product_variants where product_id = v_product_id and sku = trim(v_variant->>'sku')),
          'opening_stock', (v_variant->>'stock_qty')::integer,
          'product', v_product_id, 'opening', null, false
        );
      end if;
      v_variant_total := v_variant_total + coalesce(nullif(v_variant->>'stock_qty','')::integer, 0);
    end loop;
  end if;

  return v_product_id;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- NEXT SEQUENCE NUMBERS (row-locked per workspace)
-- ---------------------------------------------------------------------
create or replace function next_sequence(p_workspace_id uuid, p_kind text) returns integer as $$
declare
  v_val integer;
begin
  if p_kind = 'sale' then
    update workspace_settings set sale_sequence = sale_sequence + 1
     where workspace_id = p_workspace_id returning sale_sequence - 1 into v_val;
  elsif p_kind = 'purchase' then
    update workspace_settings set purchase_sequence = purchase_sequence + 1
     where workspace_id = p_workspace_id returning purchase_sequence - 1 into v_val;
  elsif p_kind = 'sku' then
    update workspace_settings set sku_sequence = sku_sequence + 1
     where workspace_id = p_workspace_id returning sku_sequence - 1 into v_val;
  else
    raise exception 'INVALID_SEQUENCE_KIND';
  end if;
  return v_val;
end;
$$ language plpgsql;

-- Generate a unique SKU: PREFIX-YYMM-#### 
create or replace function generate_sku(p_workspace_id uuid) returns text as $$
declare
  v_prefix text;
  v_seq integer;
  v_sku text;
begin
  select sku_prefix into v_prefix from workspace_settings where workspace_id = p_workspace_id;
  v_seq := next_sequence(p_workspace_id, 'sku');
  v_sku := v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
  return v_sku;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- WORKSPACE CREATION (system context): profile + member + settings + modules
-- ---------------------------------------------------------------------
create or replace function create_workspace(
  p_owner_id     uuid,
  p_name         text,
  p_business_type text,
  p_logo_url     text,
  p_currency     text,
  p_phone        text,
  p_modules      text[]
) returns uuid as $$
declare
  v_ws uuid;
  v_mod text;
begin
  insert into workspaces (name, business_type, logo_url, currency, phone, owner_id)
  values (trim(p_name), p_business_type, p_logo_url, p_currency, nullif(trim(p_phone),''), p_owner_id)
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

-- ---------------------------------------------------------------------
-- DASHBOARD STATS (single round trip)
-- ---------------------------------------------------------------------
create or replace function dashboard_stats(
  p_workspace_id uuid,
  p_days integer default 7
) returns jsonb as $$
declare
  v_result jsonb;
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 0));
begin
  select jsonb_build_object(
    'total_products', (select count(*) from products where workspace_id = p_workspace_id and status = 'active'),
    'low_stock_count', (select count(*) from products p
                         where p.workspace_id = p_workspace_id and p.status = 'active'
                           and p.stock_qty <= greatest(p.min_stock,
                                coalesce((select low_stock_threshold from workspace_settings s
                                          where s.workspace_id = p_workspace_id), 5))),
    'inventory_value', (select coalesce(sum(stock_qty * purchase_price), 0) from products
                         where workspace_id = p_workspace_id and status = 'active'),
    'today_sales_total', (select coalesce(sum(total), 0) from sales
                           where workspace_id = p_workspace_id
                             and status in ('completed','partially_returned')
                             and created_at >= date_trunc('day', now())),
    'today_sales_count', (select count(*) from sales
                           where workspace_id = p_workspace_id
                             and status in ('completed','partially_returned')
                             and created_at >= date_trunc('day', now())),
    'period_sales_total', (select coalesce(sum(total), 0) from sales
                            where workspace_id = p_workspace_id
                              and status in ('completed','partially_returned')
                              and created_at >= v_since),
    'period_sales_count', (select count(*) from sales
                            where workspace_id = p_workspace_id
                              and status in ('completed','partially_returned')
                              and created_at >= v_since),
    'daily_sales', (
      select coalesce(jsonb_agg(
               jsonb_build_object('day', g.d, 'total', coalesce(agg.total, 0), 'count', coalesce(agg.cnt, 0))
               order by g.d), '[]')
      from generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') g(d)
      left join (
        select date_trunc('day', created_at) as day,
               sum(total)::bigint as total,
               count(*)::int as cnt
          from sales
         where workspace_id = p_workspace_id
           and status in ('completed','partially_returned')
           and created_at >= v_since
         group by 1
      ) agg on agg.day = g.d
    ),
    'top_products', (
      select coalesce(jsonb_agg(
               jsonb_build_object('product_id', t.product_id, 'name', t.name,
                                  'quantity', t.qty, 'revenue', t.revenue)
               order by t.qty desc), '[]')
      from (
        select si.product_id, si.product_name as name,
               sum(si.quantity)::int as qty,
               sum(si.line_total)::bigint as revenue
          from sale_items si
          join sales s on s.id = si.sale_id
         where si.workspace_id = p_workspace_id
           and s.status in ('completed','partially_returned')
           and s.created_at >= v_since
         group by si.product_id, si.product_name
         order by qty desc
         limit 5
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$ language plpgsql stable;

