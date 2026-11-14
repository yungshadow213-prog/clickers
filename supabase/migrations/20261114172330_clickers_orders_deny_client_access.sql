create index if not exists clickers_orders_book_id_idx
  on public.clickers_orders (book_id);

drop policy if exists "No direct client access to Clickers orders" on public.clickers_orders;
create policy "No direct client access to Clickers orders"
on public.clickers_orders
for all
to anon, authenticated
using (false)
with check (false);
