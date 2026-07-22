-- Run once in the Supabase SQL Editor.
-- 1. Payment status now starts blank too, same as file status.
-- 2. Admins can delete files.

alter table public.files alter column payment_status drop default;
alter table public.files alter column payment_status drop not null;

update public.files set payment_status = null where payment_status = 'Pending';

create policy "admins can delete files"
  on public.files for delete
  using (public.current_role() = 'admin');
