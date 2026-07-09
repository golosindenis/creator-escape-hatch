alter table pages add column secondary_email text;

create table breach_alerts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  alert_type text not null,
  created_at timestamptz not null default now()
);

alter table breach_alerts enable row level security;

create policy breach_alerts_owner_read on breach_alerts
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));
