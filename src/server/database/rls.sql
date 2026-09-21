-- Row Level Security for Supabase (defence in depth).
-- The Next.js API uses the service role / direct Postgres connection and bypasses RLS.
-- Tenant scoping is still enforced in the API. These policies make a future Supabase
-- Realtime kitchen display safe if it subscribes with a user JWT.

create or replace function orderflow_current_restaurant() returns uuid
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'restaurant_id',
    current_setting('request.jwt.claims', true)::json ->> 'restaurant_id'
  ), '')::uuid
$$;

alter table restaurants enable row level security;
alter table users enable row level security;
alter table subscriptions enable row level security;
alter table dining_tables enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table menu_modifiers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_modifiers enable row level security;
alter table payments enable row level security;
alter table audit_logs enable row level security;

drop policy if exists tenant_isolation on restaurants;
create policy tenant_isolation on restaurants
  using (id = orderflow_current_restaurant())
  with check (id = orderflow_current_restaurant());

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'subscriptions', 'dining_tables', 'menu_categories', 'menu_items',
    'menu_modifiers', 'orders', 'order_items', 'payments', 'audit_logs'
  ] loop
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (restaurant_id = orderflow_current_restaurant()) with check (restaurant_id = orderflow_current_restaurant())',
      t
    );
  end loop;
end $$;
