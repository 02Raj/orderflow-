-- OrderFlow schema. Applied on API boot (PGlite locally, Postgres/Supabase in production).
-- Money is stored in integer minor units to avoid floating-point drift.

create table if not exists restaurants (
  id uuid primary key,
  name text not null,
  slug text unique,
  country_code text not null default 'US',
  currency text not null default 'USD',
  locale text not null default 'en-US',
  timezone text not null default 'America/New_York',
  tax_label text not null default 'Tax',
  tax_rate_bp integer not null default 0,
  tax_inclusive boolean not null default false,
  tax_region text,
  tax_number text,
  service_charge_bp integer not null default 0,
  phone text,
  address text,
  receipt_header text,
  receipt_footer text,
  ordering_paused boolean not null default false,
  opening_time text,
  closing_time text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  role text not null default 'owner',
  staff_pin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists users_restaurant_idx on users (restaurant_id);

create table if not exists password_reset_tokens (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_idx on password_reset_tokens (user_id);

create table if not exists subscriptions (
  id uuid primary key,
  restaurant_id uuid not null unique references restaurants (id) on delete cascade,
  status text not null default 'trialing',
  plan text not null default 'starter',
  trial_ends_at timestamptz not null,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);

alter table subscriptions add column if not exists billing_interval text not null default 'monthly'
  check (billing_interval in ('monthly', 'yearly'));

-- Provider webhook delivery IDs are unique. Keeping a receipt prevents retries or
-- concurrent deliveries from applying the same lifecycle transition twice.
create table if not exists billing_webhook_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

create table if not exists dining_tables (
  id uuid primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_number integer not null,
  label text,
  area text,
  qr_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists dining_tables_number_idx on dining_tables (restaurant_id, table_number);
create index if not exists dining_tables_restaurant_idx on dining_tables (restaurant_id);

create table if not exists menu_categories (
  id uuid primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists menu_categories_restaurant_idx on menu_categories (restaurant_id);

create table if not exists menu_items (
  id uuid primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id uuid references menu_categories (id) on delete set null,
  name text not null,
  description text,
  price_minor integer not null,
  is_available boolean not null default true,
  unavailable_reason text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_items_restaurant_idx on menu_items (restaurant_id);

create table if not exists menu_modifiers (
  id uuid primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  name text not null,
  price_adjustment_minor integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists menu_modifiers_item_idx on menu_modifiers (menu_item_id);

create table if not exists orders (
  id uuid primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_id uuid references dining_tables (id) on delete set null,
  fulfillment_type text not null default 'dine_in',
  order_number integer not null,
  business_date date not null,
  channel text not null default 'qr',
  status text not null default 'new',
  customer_label text,
  subtotal_minor integer not null default 0,
  tax_minor integer not null default 0,
  total_minor integer not null default 0,
  paid_minor integer not null default 0,
  note text,
  rejection_reason text,
  client_ref text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  closed_at timestamptz,
  voided_at timestamptz,
  void_reason text
);
create unique index if not exists orders_client_ref_idx on orders (restaurant_id, client_ref);
create unique index if not exists orders_number_idx on orders (restaurant_id, business_date, order_number);
create index if not exists orders_restaurant_status_idx on orders (restaurant_id, status);

create table if not exists order_counters (
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  business_date date not null,
  last_number integer not null,
  primary key (restaurant_id, business_date)
);

create table if not exists order_items (
  id uuid primary key,
  order_id uuid not null references orders (id) on delete cascade,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  menu_item_id uuid references menu_items (id) on delete set null,
  name_snapshot text not null,
  unit_price_minor integer not null,
  quantity integer not null default 1,
  line_total_minor integer not null,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists order_item_modifiers (
  id uuid primary key,
  order_item_id uuid not null references order_items (id) on delete cascade,
  modifier_name text not null,
  price_adjustment_minor integer not null default 0
);

create table if not exists payments (
  id uuid primary key,
  order_id uuid not null references orders (id) on delete cascade,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  method text not null,
  amount_minor integer not null,
  reference text,
  received_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index if not exists payments_restaurant_idx on payments (restaurant_id, created_at);

create table if not exists audit_logs (
  id uuid primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  user_id uuid references users (id),
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_restaurant_idx on audit_logs (restaurant_id, created_at);

-- Patches for databases created from the earlier counter-POS schema.
create table if not exists menu_modifier_groups (
  id uuid primary key,
  menu_item_id uuid not null references menu_items (id) on delete cascade,
  name text not null,
  min_choices integer not null check (min_choices >= 0),
  max_choices integer not null check (max_choices > 0 and max_choices >= min_choices),
  created_at timestamptz not null default now()
);
create index if not exists menu_modifier_groups_item_idx on menu_modifier_groups (menu_item_id);
alter table menu_modifier_groups enable row level security;
alter table menu_modifiers add column if not exists group_id uuid references menu_modifier_groups (id) on delete cascade;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists session_version integer not null default 0;
alter table restaurants add column if not exists kitchen_target_minutes integer;
alter table restaurants add column if not exists kitchen_urgent_minutes integer;
alter table orders add column if not exists correction_summary text;
alter table orders add column if not exists tax_rate_snapshot_bp integer;
alter table orders add column if not exists tax_inclusive_snapshot boolean;
alter table dining_tables add column if not exists area text;
alter table restaurants add column if not exists slug text;
alter table restaurants add column if not exists phone text;
alter table restaurants add column if not exists address text;
alter table orders add column if not exists table_id uuid;
alter table orders add column if not exists fulfillment_type text not null default 'dine_in';
alter table orders add column if not exists rejection_reason text;
alter table orders add column if not exists accepted_at timestamptz;
alter table orders add column if not exists preparing_at timestamptz;
alter table orders add column if not exists ready_at timestamptz;
alter table orders add column if not exists served_at timestamptz;
alter table orders add column if not exists closed_at timestamptz;
alter table orders add column if not exists voided_at timestamptz;
alter table orders add column if not exists void_reason text;
alter table restaurants add column if not exists tax_region text;
alter table restaurants add column if not exists ordering_paused boolean not null default false;
alter table restaurants add column if not exists opening_time text;
alter table restaurants add column if not exists closing_time text;
alter table menu_items add column if not exists description text;
alter table menu_items add column if not exists image_url text;
alter table order_items add column if not exists status text;
update order_items set status = 'pending' where status is null;
update restaurants set slug = concat('venue-', substring(id::text, 1, 8)) where slug is null or slug = '';
create unique index if not exists restaurants_slug_idx on restaurants (slug);
