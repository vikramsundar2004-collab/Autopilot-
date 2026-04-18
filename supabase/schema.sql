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
  organization_id uuid,
  provider text not null check (provider in ('google', 'slack', 'whatsapp', 'microsoft', 'notion')),
  provider_user_id text,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'disabled')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_user_id)
);

create table if not exists public.provider_token_vault (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,
  provider text not null check (provider in ('google', 'slack', 'whatsapp', 'microsoft', 'notion')),
  provider_user_id text not null default 'primary',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_user_id)
);

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,
  plan_run_id uuid,
  source_provider text not null check (source_provider in ('google', 'slack', 'whatsapp', 'microsoft', 'notion', 'manual')),
  source_external_id text,
  source_thread_id text,
  source_subject text,
  source_url text,
  title text not null,
  detail text,
  due_at timestamptz,
  priority text not null default 'medium' check (priority in ('urgent', 'high', 'medium', 'low')),
  category text not null default 'follow-up' check (category in ('reply', 'review', 'schedule', 'send', 'approve', 'follow-up')),
  status text not null default 'open' check (status in ('open', 'waiting', 'done')),
  confidence integer not null default 75 check (confidence between 0 and 100),
  effort_minutes integer not null default 15 check (effort_minutes between 1 and 480),
  impact integer not null default 5 check (impact between 1 and 10),
  rank_score numeric not null default 0,
  risk text,
  labels text[] not null default '{}',
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'enterprise' check (plan in ('free', 'pro', 'enterprise')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_sender_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  provider text not null default 'google' check (provider in ('google', 'slack', 'whatsapp', 'microsoft', 'notion', 'manual')),
  sender_email text not null,
  sender_name text,
  reason text not null default 'Private sender',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, sender_email)
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.enterprise_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  ai_provider text not null default 'openai',
  ai_model text not null default 'gpt-5.4',
  max_email_messages integer not null default 50 check (max_email_messages between 1 and 250),
  max_calendar_events integer not null default 100 check (max_calendar_events between 0 and 500),
  require_approval_for_sending boolean not null default true,
  require_approval_for_external_writes boolean not null default true,
  allow_message_body_processing boolean not null default false,
  retention_days integer not null default 90 check (retention_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  connected_account_id uuid references public.connected_accounts(id) on delete set null,
  provider text not null default 'google' check (provider in ('google', 'slack', 'whatsapp', 'microsoft', 'notion', 'manual')),
  provider_message_id text not null,
  thread_id text,
  from_name text,
  from_email text,
  subject text not null default '',
  snippet text not null default '',
  body_preview text,
  received_at timestamptz not null,
  labels text[] not null default '{}',
  importance text not null default 'normal' check (importance in ('low', 'normal', 'high', 'urgent')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_message_id)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  connected_account_id uuid references public.connected_accounts(id) on delete set null,
  provider text not null default 'google' check (provider in ('google', 'microsoft', 'manual')),
  provider_event_id text not null,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  event_type text not null default 'meeting' check (event_type in ('meeting', 'focus', 'deadline', 'personal')),
  attendees jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_event_id)
);

create table if not exists public.plan_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  run_date date not null,
  timezone text not null default 'America/Los_Angeles',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  model text,
  input_counts jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  raw_plan jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  plan_run_id uuid references public.plan_runs(id) on delete cascade,
  title text not null,
  detail text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  block_type text not null default 'focus' check (block_type in ('focus', 'meeting', 'admin', 'break', 'overflow')),
  action_item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  plan_run_id uuid references public.plan_runs(id) on delete cascade,
  action_item_id uuid references public.action_items(id) on delete set null,
  approval_type text not null check (approval_type in ('send_email', 'external_write', 'calendar_change', 'sensitive_action')),
  title text not null,
  detail text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'system', 'admin')),
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  event_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.connected_accounts add column if not exists organization_id uuid;
alter table public.action_items add column if not exists organization_id uuid;
alter table public.action_items add column if not exists plan_run_id uuid;
alter table public.action_items add column if not exists source_thread_id text;
alter table public.action_items add column if not exists source_subject text;
alter table public.action_items add column if not exists source_sender_name text;
alter table public.action_items add column if not exists source_sender_email text;
alter table public.action_items add column if not exists source_url text;
alter table public.action_items add column if not exists category text not null default 'follow-up';
alter table public.action_items add column if not exists effort_minutes integer not null default 15;
alter table public.action_items add column if not exists impact integer not null default 5;
alter table public.action_items add column if not exists rank_score numeric not null default 0;
alter table public.action_items add column if not exists requires_approval boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'connected_accounts_organization_id_fkey'
  ) then
    alter table public.connected_accounts
      add constraint connected_accounts_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'provider_token_vault_organization_id_fkey'
  ) then
    alter table public.provider_token_vault
      add constraint provider_token_vault_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'action_items_organization_id_fkey'
  ) then
    alter table public.action_items
      add constraint action_items_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'action_items_plan_run_id_fkey'
  ) then
    alter table public.action_items
      add constraint action_items_plan_run_id_fkey
      foreign key (plan_run_id) references public.plan_runs(id) on delete set null;
  end if;
end;
$$;

create index if not exists connected_accounts_user_provider_idx
  on public.connected_accounts(user_id, provider);

create index if not exists provider_token_vault_user_provider_idx
  on public.provider_token_vault(user_id, provider);

create index if not exists ai_sender_blocks_user_provider_idx
  on public.ai_sender_blocks(user_id, provider, sender_email);

create index if not exists action_items_user_status_due_idx
  on public.action_items(user_id, status, due_at);

create index if not exists organization_memberships_user_idx
  on public.organization_memberships(user_id, organization_id);

create index if not exists email_messages_user_received_idx
  on public.email_messages(user_id, received_at desc);

create index if not exists calendar_events_user_start_idx
  on public.calendar_events(user_id, start_at);

create index if not exists plan_runs_user_date_idx
  on public.plan_runs(user_id, run_date desc);

create index if not exists schedule_blocks_plan_run_idx
  on public.schedule_blocks(plan_run_id, start_at);

create index if not exists approval_requests_user_status_idx
  on public.approval_requests(user_id, status, requested_at desc);

create index if not exists audit_events_org_created_idx
  on public.audit_events(organization_id, created_at desc);

create index if not exists usage_events_org_created_idx
  on public.usage_events(organization_id, created_at desc);

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

drop trigger if exists provider_token_vault_set_updated_at on public.provider_token_vault;
create trigger provider_token_vault_set_updated_at
before update on public.provider_token_vault
for each row execute function public.set_updated_at();

drop trigger if exists ai_sender_blocks_set_updated_at on public.ai_sender_blocks;
create trigger ai_sender_blocks_set_updated_at
before update on public.ai_sender_blocks
for each row execute function public.set_updated_at();

drop trigger if exists action_items_set_updated_at on public.action_items;
create trigger action_items_set_updated_at
before update on public.action_items
for each row execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists organization_memberships_set_updated_at on public.organization_memberships;
create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function public.set_updated_at();

drop trigger if exists enterprise_policies_set_updated_at on public.enterprise_policies;
create trigger enterprise_policies_set_updated_at
before update on public.enterprise_policies
for each row execute function public.set_updated_at();

drop trigger if exists email_messages_set_updated_at on public.email_messages;
create trigger email_messages_set_updated_at
before update on public.email_messages
for each row execute function public.set_updated_at();

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists schedule_blocks_set_updated_at on public.schedule_blocks;
create trigger schedule_blocks_set_updated_at
before update on public.schedule_blocks
for each row execute function public.set_updated_at();

drop trigger if exists approval_requests_set_updated_at on public.approval_requests;
create trigger approval_requests_set_updated_at
before update on public.approval_requests
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

create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_memberships (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (organization_id, user_id) do nothing;

  insert into public.enterprise_policies (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
after insert on public.organizations
for each row execute function public.handle_new_organization();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_organization_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_admin_role(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.provider_token_vault enable row level security;
alter table public.ai_sender_blocks enable row level security;
alter table public.action_items enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.enterprise_policies enable row level security;
alter table public.email_messages enable row level security;
alter table public.calendar_events enable row level security;
alter table public.plan_runs enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.approval_requests enable row level security;
alter table public.audit_events enable row level security;
alter table public.usage_events enable row level security;

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
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can manage their AI sender blocks" on public.ai_sender_blocks;
create policy "Users can manage their AI sender blocks"
on public.ai_sender_blocks for all
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can manage their action items" on public.action_items;
create policy "Users can manage their action items"
on public.action_items for all
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can create organizations" on public.organizations;
create policy "Users can create organizations"
on public.organizations for insert
with check (auth.uid() = created_by);

drop policy if exists "Members can read organizations" on public.organizations;
create policy "Members can read organizations"
on public.organizations for select
using (public.is_org_member(id));

drop policy if exists "Admins can update organizations" on public.organizations;
create policy "Admins can update organizations"
on public.organizations for update
using (public.has_org_admin_role(id))
with check (public.has_org_admin_role(id));

drop policy if exists "Members can read memberships" on public.organization_memberships;
create policy "Members can read memberships"
on public.organization_memberships for select
using (public.is_org_member(organization_id));

drop policy if exists "Admins can manage memberships" on public.organization_memberships;
create policy "Admins can manage memberships"
on public.organization_memberships for all
using (public.has_org_admin_role(organization_id))
with check (public.has_org_admin_role(organization_id));

drop policy if exists "Members can read enterprise policies" on public.enterprise_policies;
create policy "Members can read enterprise policies"
on public.enterprise_policies for select
using (public.is_org_member(organization_id));

drop policy if exists "Admins can manage enterprise policies" on public.enterprise_policies;
create policy "Admins can manage enterprise policies"
on public.enterprise_policies for all
using (public.has_org_admin_role(organization_id))
with check (public.has_org_admin_role(organization_id));

drop policy if exists "Users can manage their email messages" on public.email_messages;
create policy "Users can manage their email messages"
on public.email_messages for all
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can manage their calendar events" on public.calendar_events;
create policy "Users can manage their calendar events"
on public.calendar_events for all
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can manage their plan runs" on public.plan_runs;
create policy "Users can manage their plan runs"
on public.plan_runs for all
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can manage their schedule blocks" on public.schedule_blocks;
create policy "Users can manage their schedule blocks"
on public.schedule_blocks for all
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can manage their approval requests" on public.approval_requests;
create policy "Users can manage their approval requests"
on public.approval_requests for all
using (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)))
with check (auth.uid() = user_id and (organization_id is null or public.is_org_member(organization_id)));

drop policy if exists "Users can read their audit events" on public.audit_events;
create policy "Users can read their audit events"
on public.audit_events for select
using (auth.uid() = user_id or public.is_org_member(organization_id));

drop policy if exists "Users can create their audit events" on public.audit_events;
create policy "Users can create their audit events"
on public.audit_events for insert
with check (
  auth.uid() = user_id
  and (organization_id is null or public.is_org_member(organization_id))
);

drop policy if exists "Users can read their usage events" on public.usage_events;
create policy "Users can read their usage events"
on public.usage_events for select
using (auth.uid() = user_id or public.is_org_member(organization_id));

drop policy if exists "Users can create their usage events" on public.usage_events;
create policy "Users can create their usage events"
on public.usage_events for insert
with check (
  auth.uid() = user_id
  and (organization_id is null or public.is_org_member(organization_id))
);
