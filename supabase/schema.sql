-- Rebbi App on Supabase: tables, who-may-see-what (row level security) and the few database functions the app calls.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this whole file → Run. Safe to run again.
--
--   classes    one class (or the office's own data) per row, owned by the account that uploaded it.
--              A rebbi reads and writes only his own; the office reads and writes every class.
--              data / issues hold one JSON string per top-level key / per issue, so edits from two devices merge.
--   admins     office accounts (by email). Added by the project owner in the dashboard, never from the app.
--   people     the rebbeim directory: which classes each account has (names only), so a rebbi can pick another
--              rebbi to send an issue to. Readable by accounts that have a class themselves, and the office.
--   shared     an issue a rebbi sent to other rebbeim. Only the people on it (members, by email) can read it.
--              The sender writes it; the others may only add replies and read marks (shared_reply / shared_seen).
--   calendars  a rebbi's live calendar (.ics text), served by the "calendar" Edge Function. Token = long secret.

create table if not exists public.admins (email text primary key);

create table if not exists public.classes (
  id text primary key,
  owner uuid not null default auth.uid(),
  owner_email text not null default '',
  name text not null default '',
  class_name text not null default '',
  role text not null default 'rebbi' check (role in ('rebbi', 'admin')),
  sample_grade int not null default 0,
  sample boolean not null default false,
  staff text not null default '',
  data jsonb not null default '{}'::jsonb,
  issues jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_device text not null default '',
  constraint classes_size check (pg_column_size(data) + pg_column_size(issues) < 2000000)
);
create index if not exists classes_owner on public.classes (owner);

create table if not exists public.people (
  email text primary key,
  uid uuid not null,
  profiles jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared (
  id text primary key,
  from_uid uuid not null,
  from_email text not null,
  from_profile_id text not null,
  members text[] not null,
  to_keys text[] not null default '{}',
  issue text not null,
  by_phone text not null default '',
  replies jsonb not null default '{}'::jsonb,
  seen jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists shared_members on public.shared using gin (members);

create table if not exists public.calendars (
  token text primary key check (length(token) >= 24),
  owner uuid not null default auth.uid(),
  name text not null default '',
  ics text not null check (length(ics) < 900000),
  updated_at timestamptz not null default now()
);

-- ---------- helpers ----------
create or replace function public.my_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
-- Signed in with Google (whose email addresses are always verified). app_metadata can't be changed by the user,
-- so an email/password sign-up (if ever turned on) can't pretend to own someone else's address.
create or replace function public.verified() returns boolean language sql stable as $$
  select auth.uid() is not null and public.my_email() <> ''
    and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
$$;
-- security definer: reads admins even though nobody may list that table.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select public.verified() and exists (select 1 from public.admins a where lower(a.email) = public.my_email())
$$;
create or replace function public.has_class() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people p where p.email = public.my_email() and p.profiles <> '{}'::jsonb)
$$;

alter table public.admins enable row level security;
alter table public.classes enable row level security;
alter table public.people enable row level security;
alter table public.shared enable row level security;
alter table public.calendars enable row level security;

-- ---------- admins: you may only check yourself ----------
drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (lower(email) = public.my_email());

-- ---------- classes ----------
drop policy if exists classes_read on public.classes;
drop policy if exists classes_create on public.classes;
drop policy if exists classes_update on public.classes;
drop policy if exists classes_delete on public.classes;
create policy classes_read on public.classes for select to authenticated using (public.is_admin() or owner = auth.uid());
-- New classes belong to whoever uploads them.
create policy classes_create on public.classes for insert to authenticated with check (owner = auth.uid());
-- Only the office can hand a class to someone else.
create policy classes_update on public.classes for update to authenticated
  using (public.is_admin() or owner = auth.uid()) with check (public.is_admin() or owner = auth.uid());
create policy classes_delete on public.classes for delete to authenticated using (public.is_admin() or owner = auth.uid());

-- Changes only the given keys of a class (others' edits to other keys are kept). Runs with the caller's rights.
--   set_data / set_issues: { key: json string }, del_data / del_issues: keys to remove, meta: name / class_name.
create or replace function public.class_patch(p_id text, p_device text, meta jsonb,
    set_data jsonb, del_data text[], set_issues jsonb, del_issues text[])
returns boolean language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.classes set
    data = (data || coalesce(set_data, '{}'::jsonb)) - coalesce(del_data, '{}'::text[]),
    issues = (issues || coalesce(set_issues, '{}'::jsonb)) - coalesce(del_issues, '{}'::text[]),
    name = coalesce(meta ->> 'name', name),
    class_name = coalesce(meta ->> 'class_name', class_name),
    updated_at = now(), updated_by = auth.uid(), updated_device = coalesce(p_device, '')
  where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'class % not found or not yours', p_id using errcode = '42501'; end if;
  return true;
end $$;

-- ---------- people ----------
drop policy if exists people_read on public.people;
drop policy if exists people_write on public.people;
drop policy if exists people_update on public.people;
drop policy if exists people_delete on public.people;
-- (Your own entry is always readable: saving it with upsert needs that.)
create policy people_read on public.people for select to authenticated
  using (public.verified() and (email = public.my_email() or public.is_admin() or public.has_class()));
create policy people_write on public.people for insert to authenticated with check (public.verified() and email = public.my_email() and uid = auth.uid());
create policy people_update on public.people for update to authenticated
  using (public.verified() and email = public.my_email()) with check (email = public.my_email() and uid = auth.uid());
create policy people_delete on public.people for delete to authenticated using (public.verified() and email = public.my_email());

-- ---------- shared issues ----------
drop policy if exists shared_read on public.shared;
drop policy if exists shared_create on public.shared;
drop policy if exists shared_update on public.shared;
drop policy if exists shared_delete on public.shared;
create policy shared_read on public.shared for select to authenticated using (public.verified() and public.my_email() = any (members));
create policy shared_create on public.shared for insert to authenticated
  with check (public.verified() and from_uid = auth.uid() and public.my_email() = any (members));
-- The sender may change anything except who sent it (replies / seen from others go through the functions below).
create policy shared_update on public.shared for update to authenticated
  using (public.verified() and from_uid = auth.uid()) with check (from_uid = auth.uid() and public.my_email() = any (members));
create policy shared_delete on public.shared for delete to authenticated using (public.verified() and from_uid = auth.uid());

-- The sender writes the issue itself; replies and read marks already there are kept.
create or replace function public.shared_put(p_id text, p_profile text, p_members text[], p_to_keys text[], p_issue text, p_phone text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  insert into public.shared as s (id, from_uid, from_email, from_profile_id, members, to_keys, issue, by_phone)
  values (p_id, auth.uid(), public.my_email(), p_profile, p_members, p_to_keys, p_issue, coalesce(p_phone, ''))
  on conflict (id) do update set from_profile_id = excluded.from_profile_id, members = excluded.members, to_keys = excluded.to_keys,
    issue = excluded.issue, by_phone = excluded.by_phone, updated_at = now()
  where s.from_uid = auth.uid();
  return found;
end $$;

-- Anyone on the issue may add a reply / mark it read. security definer, so it checks membership itself.
create or replace function public.shared_reply(p_id text, p_note_id text, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.verified() then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.shared set replies = replies || jsonb_build_object(p_note_id, p_note), updated_at = now()
  where id = p_id and public.my_email() = any (members);
  if not found then raise exception 'not on this issue' using errcode = '42501'; end if;
  return true;
end $$;
create or replace function public.shared_seen(p_id text, p_profile text, p_n int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.verified() then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.shared set seen = seen || jsonb_build_object(p_profile, p_n)
  where id = p_id and public.my_email() = any (members);
  return found;
end $$;

-- ---------- calendars: written by the owner, read only by the Edge Function (service role) ----------
drop policy if exists calendars_owner on public.calendars;
create policy calendars_owner on public.calendars for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- ---------- grants ----------
revoke all on public.admins, public.classes, public.people, public.shared, public.calendars from anon;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.classes, public.people, public.shared, public.calendars to authenticated;
revoke all on function public.class_patch, public.shared_put, public.shared_reply, public.shared_seen, public.is_admin, public.has_class from public, anon;
grant execute on function public.class_patch, public.shared_put, public.shared_reply, public.shared_seen, public.is_admin, public.has_class to authenticated;

-- ---------- live updates ----------
do $$ begin
  begin alter publication supabase_realtime add table public.classes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.people; exception when others then null; end;
  begin alter publication supabase_realtime add table public.shared; exception when others then null; end;
end $$;
