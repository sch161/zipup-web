-- Needed so `sync-news` can upsert on `url` without creating duplicate rows on repeated syncs.
alter table public.news
  add constraint news_url_key unique (url);
