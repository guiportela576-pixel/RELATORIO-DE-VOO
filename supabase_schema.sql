create extension if not exists pgcrypto;

create table if not exists public.flight_entries (
  id uuid primary key default gen_random_uuid(),
  flight_date text not null,
  num text,
  nome text,
  missao text,
  codigo text,
  voo text,
  inicio text,
  tempo text,
  ua text,
  ciclos text,
  nbat text,
  carga_ini text,
  carga_fim text,
  obs text,
  deleted boolean not null default false,
  created_at_client timestamptz,
  updated_at_client timestamptz,
  deleted_at_client timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_flight_entries_updated_at ON public.flight_entries;
create trigger trg_flight_entries_updated_at
before update on public.flight_entries
for each row
execute function public.set_updated_at();

alter table public.flight_entries enable row level security;

drop policy if exists "anon can select flight_entries" on public.flight_entries;
create policy "anon can select flight_entries"
on public.flight_entries
for select
to anon
using (true);

drop policy if exists "anon can insert flight_entries" on public.flight_entries;
create policy "anon can insert flight_entries"
on public.flight_entries
for insert
to anon
with check (true);

drop policy if exists "anon can update flight_entries" on public.flight_entries;
create policy "anon can update flight_entries"
on public.flight_entries
for update
to anon
using (true)
with check (true);
