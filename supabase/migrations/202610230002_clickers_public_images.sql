insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clickers-book-images',
  'clickers-book-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "Clickers authors upload book images" on storage.objects;
create policy "Clickers authors upload book images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'clickers-book-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Clickers authors update book images" on storage.objects;
create policy "Clickers authors update book images"
on storage.objects for update to authenticated
using (
  bucket_id = 'clickers-book-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'clickers-book-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);