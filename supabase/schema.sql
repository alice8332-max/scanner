-- Run this in Supabase SQL Editor.
-- It creates the private scans bucket, the scans table, RLS policies,
-- and the atomic delete_scan RPC used by the library page.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('scans', 'scans', false)
on conflict (id) do update set public = false;

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  path text not null,
  size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists scans_user_created_idx
  on public.scans (user_id, created_at desc);

alter table public.scans enable row level security;

drop policy if exists scans_select_own on public.scans;
create policy scans_select_own on public.scans
  for select using (auth.uid() = user_id);

drop policy if exists scans_insert_own on public.scans;
create policy scans_insert_own on public.scans
  for insert with check (auth.uid() = user_id);

drop policy if exists scans_delete_own on public.scans;
create policy scans_delete_own on public.scans
  for delete using (auth.uid() = user_id);

drop policy if exists scans_obj_select_own on storage.objects;
create policy scans_obj_select_own on storage.objects
  for select using (
    bucket_id = 'scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists scans_obj_insert_own on storage.objects;
create policy scans_obj_insert_own on storage.objects
  for insert with check (
    bucket_id = 'scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists scans_obj_delete_own on storage.objects;
create policy scans_obj_delete_own on storage.objects
  for delete using (
    bucket_id = 'scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace function public.delete_scan(scan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p text;
begin
  select path into p
  from public.scans
  where id = scan_id and user_id = auth.uid();

  if p is null then
    raise exception 'scan not found';
  end if;

  delete from storage.objects
  where bucket_id = 'scans' and name = p;

  delete from public.scans
  where id = scan_id and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_scan(uuid) from public;
grant execute on function public.delete_scan(uuid) to authenticated;
