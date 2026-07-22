-- Run once in the Supabase SQL Editor.
-- 1. Logs a "status changed to Requested" entry on a file when a PIC
--    requests it, and lets PIC reset a file's status when cancelling
--    their own request — both via narrow functions since PIC has no
--    general UPDATE permission on the files table.
-- 2. Broadens PIC's own-request delete policy so they can cancel an
--    active (not just delivered) request.

create or replace function public.log_file_request(p_case_reference text, p_time text, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.files
  set logs = logs || jsonb_build_object('time', p_time, 'action', 'status changed to "Requested"', 'by', p_by)
  where lower(trim(case_reference)) = lower(trim(p_case_reference))
    and public.current_role() is not null;
end;
$$;

revoke all on function public.log_file_request(text, text, text) from public;
grant execute on function public.log_file_request(text, text, text) to authenticated;

create or replace function public.pic_return_file(p_case_reference text, p_time text, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.files
  set status = null, payment_status = null,
      logs = logs || jsonb_build_object('time', p_time, 'action', 'File returned — status reset', 'by', p_by)
  where lower(trim(case_reference)) = lower(trim(p_case_reference))
    and public.current_role() is not null;
end;
$$;

revoke all on function public.pic_return_file(text, text, text) from public;
grant execute on function public.pic_return_file(text, text, text) to authenticated;

drop policy if exists "pic can remove own delivered requests" on public.requests;

create policy "pic can remove own requests"
  on public.requests for delete
  using (
    public.current_role() = 'pic'
    and requested_by = auth.uid()
  );
