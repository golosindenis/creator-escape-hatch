alter table backed_up_media
  add column parent_media_id uuid references backed_up_media(id) on delete cascade,
  add column position int;

create index backed_up_media_parent_idx on backed_up_media (parent_media_id);
