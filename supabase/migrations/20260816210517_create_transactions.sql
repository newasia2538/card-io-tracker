create extension if not exists pg_graphql;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  card_type text not null,
  custom_card_type text,
  price numeric(14, 2) not null,
  currency text not null,
  price_thb numeric(14, 2) not null,
  exchange_rate_to_thb numeric(18, 8) not null,
  exchange_rate_date date not null,
  transaction_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_action_check
    check (action in ('BUY', 'SELL')),
  constraint transactions_currency_check
    check (currency in ('THB', 'USD')),
  constraint transactions_price_check
    check (price > 0),
  constraint transactions_price_thb_check
    check (price_thb > 0),
  constraint transactions_exchange_rate_to_thb_check
    check (exchange_rate_to_thb > 0),
  constraint transactions_card_type_custom_card_type_check
    check (
      (
        card_type = 'Others'
        and nullif(trim(custom_card_type), '') is not null
      )
      or (
        card_type <> 'Others'
        and custom_card_type is null
      )
    )
);

create index transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc, created_at desc);

revoke all on table public.transactions from anon, authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;

alter table public.transactions enable row level security;

create policy transactions_select_own
  on public.transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy transactions_insert_own
  on public.transactions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy transactions_update_own
  on public.transactions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy transactions_delete_own
  on public.transactions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
