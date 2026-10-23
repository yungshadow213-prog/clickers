insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clickers-book-images', 'clickers-book-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.clickers_books
  add column if not exists extra_images jsonb not null default '[]'::jsonb;
