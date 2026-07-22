-- Ezri File System — schema + row level security
-- Run this once in the Supabase project's SQL Editor.

create extension if not exists pgcrypto;

-- ── Tables ──────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  name text not null,
  role text not null check (role in ('admin', 'pic', 'op')),
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  case_reference text not null,
  box_reference text not null,
  status text,
  payment_status text,
  remarks text not null default '',
  logs jsonb not null default '[]'::jsonb,
  requested_by uuid references public.profiles (id),
  requested_by_name text,
  created_by text,
  created_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null,
  client_name text not null,
  use_type text not null,
  status text not null default 'Pending',
  requested_by uuid not null references public.profiles (id),
  requested_by_name text not null,
  requested_at timestamptz not null default now()
);

-- ── Helper: current user's role, NULL if disabled/missing ──

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and not disabled;
$$;

-- ── Row level security ──────────────────────────────────

alter table public.profiles enable row level security;
alter table public.files enable row level security;
alter table public.requests enable row level security;

-- profiles: any active staff member can see the member list;
-- only admins can add/edit members.
create policy "active staff can view profiles"
  on public.profiles for select
  using (public.current_role() is not null);

create policy "admins can add members"
  on public.profiles for insert
  with check (public.current_role() = 'admin');

create policy "admins can edit members"
  on public.profiles for update
  using (public.current_role() = 'admin');

-- files: any active staff member can view; only op/admin can add or edit.
create policy "active staff can view files"
  on public.files for select
  using (public.current_role() is not null);

create policy "op and admin can add files"
  on public.files for insert
  with check (public.current_role() in ('op', 'admin'));

create policy "op and admin can edit files"
  on public.files for update
  using (public.current_role() in ('op', 'admin'));

create policy "admins can delete files"
  on public.files for delete
  using (public.current_role() = 'admin');

-- requests: any active staff member can view;
-- pic/admin can submit, op/admin can update status.
create policy "active staff can view requests"
  on public.requests for select
  using (public.current_role() is not null);

create policy "pic and admin can submit requests"
  on public.requests for insert
  with check (
    public.current_role() in ('pic', 'admin')
    and requested_by = auth.uid()
  );

create policy "op and admin can update requests"
  on public.requests for update
  using (public.current_role() in ('op', 'admin'));

-- ── Realtime ────────────────────────────────────────────

alter publication supabase_realtime add table public.files;
alter publication supabase_realtime add table public.requests;
alter publication supabase_realtime add table public.profiles;

-- ── Bootstrap admin ─────────────────────────────────────
-- 1. In the Supabase dashboard: Authentication > Users > Add User.
--    Create the first admin with an email ending in @ezri.my and a password.
-- 2. Copy that user's UID, then run (replacing the placeholders):
--
-- insert into public.profiles (id, email, name, role)
-- values ('paste-user-uid-here', 'admin@ezri.my', 'Admin', 'admin');
