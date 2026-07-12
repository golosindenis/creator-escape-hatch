create table instagram_connections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade unique,
  ig_user_id text not null,
  ig_username text not null,
  access_token text not null,
  token_expires_at timestamptz not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table backed_up_media (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  ig_media_id text not null,
  media_type text not null,
  caption text,
  like_count int,
  comments_count int,
  permalink text,
  storage_path text not null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (page_id, ig_media_id)
);

alter table instagram_connections enable row level security;
alter table backed_up_media enable row level security;

create policy instagram_connections_owner_all on instagram_connections
  for all using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()))
  with check (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));

create policy backed_up_media_owner_read on backed_up_media
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));

insert into storage.buckets (id, name, public) values ('instagram-backups', 'instagram-backups', false);
