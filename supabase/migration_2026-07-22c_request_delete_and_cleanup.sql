-- Run once in the Supabase SQL Editor.
-- Admin file deletion now also removes linked requests, which needs
-- delete permission on the requests table.

create policy "admins can delete requests"
  on public.requests for delete
  using (public.current_role() = 'admin');

-- One-off cleanup: remove any requests left orphaned by files that
-- were already deleted before this policy/app change existed.
delete from public.requests r
where not exists (
  select 1 from public.files f
  where lower(trim(f.case_reference)) = lower(trim(r.case_reference))
);
