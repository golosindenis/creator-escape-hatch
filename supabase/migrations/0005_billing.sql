alter table pages add column subscription_status text not null default 'none'
  check (subscription_status in ('none', 'active', 'expired'));
alter table pages add column comped boolean not null default false;
alter table pages add column lemonsqueezy_customer_id text;
alter table pages add column lemonsqueezy_subscription_id text unique;
alter table pages add column lemonsqueezy_renews_at timestamptz;
