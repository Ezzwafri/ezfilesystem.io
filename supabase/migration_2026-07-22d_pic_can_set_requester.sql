-- Run once in the Supabase SQL Editor.
-- PIC has no general UPDATE permission on files, so their request-submit
-- flow couldn't stamp "Requested By" onto an already-existing file.
-- This function lets any active staff member do just that narrow write,
-- without granting PIC broader edit access to the files table.

create or replace function public.set_file_requester(p_case_reference text, p_requested_by uuid, p_requested_by_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.files
  set requested_by = p_requested_by, requested_by_name = p_requested_by_name
  where lower(trim(case_reference)) = lower(trim(p_case_reference))
    and public.current_role() is not null;
$$;

revoke all on function public.set_file_requester(text, uuid, text) from public;
grant execute on function public.set_file_requester(text, uuid, text) to authenticated;
