create extension if not exists "pgcrypto";

create table pages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  creator_name text not null,
  real_handle text not null,
  break_glass_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table subscribers (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (page_id, email)
);

create table break_glass_events (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  activated boolean not null,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table pages enable row level security;
alter table subscribers enable row level security;
alter table break_glass_events enable row level security;

-- Owners manage their own pages.
create policy pages_owner_all on pages
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- Owners read their subscribers / events.
create policy subs_owner_read on subscribers
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));
create policy events_owner_read on break_glass_events
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));
