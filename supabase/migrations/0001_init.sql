-- ==========================================================
-- SST Intelligence — schema inicial (Supabase / PostgreSQL)
-- ==========================================================
-- Cria as tabelas principais, o provisionamento automático de
-- perfil no cadastro, as políticas de RLS e o trigger que gera
-- uma NC automaticamente quando um item de checklist é marcado
-- como "não conforme".
--
-- Como aplicar:
--   Supabase → SQL Editor → colar este arquivo inteiro → Run
--   (ou via CLI: supabase db push, com este arquivo em
--   supabase/migrations/)
-- ==========================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------
-- Perfis (estende auth.users)
-- ----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'tecnico' check (role in ('admin','tst','tecnico','supervisor')),
  created_at timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------
-- Obras (sites)
-- ----------------------------------------------------------
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  status text not null default 'Ativa' check (status in ('Ativa','Inativa')),
  responsible_team text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- Trabalhadores
-- ----------------------------------------------------------
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null,
  site_id uuid references public.sites(id) on delete set null,
  status text not null default 'Ativo' check (status in ('Ativo','Inativo')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- Código automático de inspeção (INS-00001, INS-00002, ...)
-- ----------------------------------------------------------
create sequence if not exists public.inspection_code_seq start 1;

create or replace function public.generate_inspection_code()
returns text
language sql
as $$
  select 'INS-' || lpad(nextval('public.inspection_code_seq')::text, 5, '0');
$$;

-- ----------------------------------------------------------
-- Inspeções
-- ----------------------------------------------------------
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_inspection_code(),
  site_id uuid not null references public.sites(id) on delete cascade,
  checklist_type text not null,
  location text,
  notes text,
  inspector_id uuid references auth.users(id),
  inspection_date date not null default current_date,
  status text not null default 'IN_PROGRESS' check (status in ('SCHEDULED','IN_PROGRESS','COMPLETED')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- Itens de checklist de cada inspeção
-- ----------------------------------------------------------
create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  description text not null,
  result text not null check (result in ('conforme','nao_conforme','na')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------
-- Código automático de NC (NC-2026-000146, ...)
-- ----------------------------------------------------------
create sequence if not exists public.nc_code_seq start 1;

create or replace function public.generate_nc_code()
returns text
language sql
as $$
  select 'NC-' || extract(year from now())::text || '-' || lpad(nextval('public.nc_code_seq')::text, 6, '0');
$$;

-- ----------------------------------------------------------
-- Não conformidades (NCs)
-- ----------------------------------------------------------
create table if not exists public.non_conformities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_nc_code(),
  site_id uuid not null references public.sites(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete set null,
  inspection_item_id uuid references public.inspection_items(id) on delete set null,
  description text not null,
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING_VALIDATION','RESOLVED')),
  due_date date,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ==========================================================
-- Trigger: gera NC automaticamente quando um item de checklist
-- é marcado como "não conforme"
-- ==========================================================
create or replace function public.fn_auto_create_nc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.result = 'nao_conforme' then
    insert into public.non_conformities (
      site_id, inspection_id, inspection_item_id, description, priority, status
    )
    select
      i.site_id,
      new.inspection_id,
      new.id,
      new.description,
      'MEDIUM',
      'OPEN'
    from public.inspections i
    where i.id = new.inspection_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_create_nc on public.inspection_items;
create trigger trg_auto_create_nc
  after insert on public.inspection_items
  for each row
  execute function public.fn_auto_create_nc();

-- ==========================================================
-- Row Level Security (RLS)
-- ==========================================================
alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.workers enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_items enable row level security;
alter table public.non_conformities enable row level security;

-- Função auxiliar: usuário logado tem um dos papéis informados?
create or replace function public.current_role_is(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = any(roles)
  );
$$;

-- Profiles: cada um vê e edita o próprio; admin vê todos
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.current_role_is(array['admin']));
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- Sites: leitura para qualquer autenticado; escrita só admin/tst
create policy "sites_select_authenticated" on public.sites
  for select using (auth.role() = 'authenticated');
create policy "sites_insert_admin_tst" on public.sites
  for insert with check (public.current_role_is(array['admin','tst']));
create policy "sites_update_admin_tst" on public.sites
  for update using (public.current_role_is(array['admin','tst']));
create policy "sites_delete_admin" on public.sites
  for delete using (public.current_role_is(array['admin']));

-- Workers: leitura para autenticados; escrita admin/tst
create policy "workers_select_authenticated" on public.workers
  for select using (auth.role() = 'authenticated');
create policy "workers_insert_admin_tst" on public.workers
  for insert with check (public.current_role_is(array['admin','tst']));
create policy "workers_update_admin_tst" on public.workers
  for update using (public.current_role_is(array['admin','tst']));
create policy "workers_delete_admin" on public.workers
  for delete using (public.current_role_is(array['admin']));

-- Inspections: leitura para autenticados; inspetor cria/edita as suas, admin/tst tudo
create policy "inspections_select_authenticated" on public.inspections
  for select using (auth.role() = 'authenticated');
create policy "inspections_insert_own_or_admin" on public.inspections
  for insert with check (inspector_id = auth.uid() or public.current_role_is(array['admin','tst']));
create policy "inspections_update_own_or_admin" on public.inspections
  for update using (inspector_id = auth.uid() or public.current_role_is(array['admin','tst']));

-- Inspection items: seguem a permissão da inspeção "mãe"
create policy "items_select_authenticated" on public.inspection_items
  for select using (auth.role() = 'authenticated');
create policy "items_insert_own_inspection" on public.inspection_items
  for insert with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (i.inspector_id = auth.uid() or public.current_role_is(array['admin','tst']))
    )
  );

-- Non-conformities: leitura para autenticados; status só muda por admin/tst
-- (os inserts "normais" acontecem via trigger, que roda como security definer)
create policy "ncs_select_authenticated" on public.non_conformities
  for select using (auth.role() = 'authenticated');
create policy "ncs_update_admin_tst" on public.non_conformities
  for update using (public.current_role_is(array['admin','tst']));
