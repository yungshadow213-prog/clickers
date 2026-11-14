alter table public.clickers_books
  add column if not exists price_minor bigint not null default 0,
  add column if not exists currency text not null default 'NGN',
  add column if not exists for_sale boolean not null default false,
  add column if not exists ebook_file_path text not null default '';

alter table public.clickers_books
  drop constraint if exists clickers_books_price_minor_check,
  add constraint clickers_books_price_minor_check check (price_minor >= 0 and price_minor <= 1000000000),
  drop constraint if exists clickers_books_currency_check,
  add constraint clickers_books_currency_check check (currency = 'NGN'),
  drop constraint if exists clickers_books_sale_requirements_check,
  add constraint clickers_books_sale_requirements_check
    check (not for_sale or (price_minor >= 100 and length(ebook_file_path) > 0));

create table if not exists public.clickers_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  book_id uuid references public.clickers_books(id) on delete set null,
  book_title text not null,
  amount_minor bigint not null check (amount_minor >= 100),
  currency text not null default 'NGN' check (currency = 'NGN'),
  buyer_email text not null check (char_length(buyer_email) between 3 and 254),
  reference text not null unique check (reference ~ '^clk-[a-f0-9]{32}$'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  ebook_file_path text not null,
  gateway_response jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists clickers_orders_owner_created_idx
  on public.clickers_orders (owner_id, created_at desc);
create index if not exists clickers_orders_status_created_idx
  on public.clickers_orders (status, created_at desc);

alter table public.clickers_orders enable row level security;
revoke all on public.clickers_orders from anon, authenticated;
grant all on public.clickers_orders to service_role;
