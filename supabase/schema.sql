-- Autopilot-AI starter Supabase schema.
-- Run this in the Supabase SQL editor after creating the project.
-- This stores profiles, local-style preferences, connected-account metadata,
-- and extracted action items. Provider tokens must stay server-side.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customization jsonb not null default '{}'::jsonb,
  tutorial jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'slack', 'whatsapp', 'microsoft', 'notion')),
  provider_user_id text,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'disabled')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_user_id)
);

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_provider text not null check (source_provider in ('google', 'slack', 'whatsapp', 'microsoft', 'notion', 'manual')),
  source_external_id text,
  title text not null,
  detail text,
  due_at timestamptz,
  priority text not null default 'medium' check (priority in ('urgent', 'high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'waiting', 'done')),
  confidence integer not null default 75 check (confidence between 0 and 100),
  risk text,
  labels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connected_accounts_user_provider_idx
  on public.connected_accounts(user_id, provider);

create index if not exists action_items_user_status_due_idx
  on public.action_items(user_id, status, due_at);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists connected_accounts_set_updated_at on public.connected_accounts;
create trigger connected_accounts_set_updated_at
before update on public.connected_accounts
for each row execute function public.set_updated_at();

drop trigger if exists action_items_set_updated_at on public.action_items;
create trigger action_items_set_updated_at
before update on public.action_items
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.action_items enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can manage their settings" on public.user_settings;
create policy "Users can manage their settings"
on public.user_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their connected account metadata" on public.connected_accounts;
create policy "Users can manage their connected account metadata"
on public.connected_accounts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their action items" on public.action_items;
create policy "Users can manage their action items"
on public.action_items for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
