create extension if not exists pgcrypto;

create table if not exists public.clickers_books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '',
  genre text not null default '',
  cover_path text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug),
  unique (id, owner_id)
);

create table if not exists public.clickers_chapters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.clickers_books(id) on delete cascade,
  chapter_number integer not null check (chapter_number between 1 and 10000),
  title text not null check (char_length(title) between 1 and 180),
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, chapter_number),
  constraint clickers_chapter_owner_matches_book
    foreign key (book_id, owner_id)
    references public.clickers_books(id, owner_id)
    on delete cascade
    deferrable initially immediate
);

create table if not exists public.clickers_chapter_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid references public.clickers_chapters(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists clickers_books_owner_status_idx
  on public.clickers_books (owner_id, status, updated_at desc);
create index if not exists clickers_chapters_book_publish_idx
  on public.clickers_chapters (book_id, status, is_paid, chapter_number);
create index if not exists clickers_chapter_revisions_owner_chapter_idx
  on public.clickers_chapter_revisions (owner_id, chapter_id, created_at desc);

create or replace function public.clickers_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clickers_books_updated_at on public.clickers_books;
create trigger clickers_books_updated_at
before update on public.clickers_books
for each row execute function public.clickers_set_updated_at();

drop trigger if exists clickers_chapters_updated_at on public.clickers_chapters;
create trigger clickers_chapters_updated_at
before update on public.clickers_chapters
for each row execute function public.clickers_set_updated_at();

alter table public.clickers_books enable row level security;
alter table public.clickers_chapters enable row level security;
alter table public.clickers_chapter_revisions enable row level security;

drop policy if exists "Owners can access their Clickers books" on public.clickers_books;
create policy "Owners can access their Clickers books"
on public.clickers_books for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can access their Clickers chapters" on public.clickers_chapters;
create policy "Owners can access their Clickers chapters"
on public.clickers_chapters for all to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.clickers_books b
    where b.id = book_id and b.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can access their Clickers chapter revisions" on public.clickers_chapter_revisions;
create policy "Owners can access their Clickers chapter revisions"
on public.clickers_chapter_revisions for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

revoke all on public.clickers_books from anon, authenticated;
revoke all on public.clickers_chapters from anon, authenticated;
revoke all on public.clickers_chapter_revisions from anon, authenticated;
grant all on public.clickers_books to service_role;
grant all on public.clickers_chapters to service_role;
grant all on public.clickers_chapter_revisions to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clickers-private',
  'clickers-private',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Clickers owners read their private assets" on storage.objects;
create policy "Clickers owners read their private assets"
on storage.objects for select to authenticated
using (
  bucket_id = 'clickers-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Clickers owners upload their private assets" on storage.objects;
create policy "Clickers owners upload their private assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'clickers-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Clickers owners update their private assets" on storage.objects;
create policy "Clickers owners update their private assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'clickers-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'clickers-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Clickers owners delete their private assets" on storage.objects;
create policy "Clickers owners delete their private assets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'clickers-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
