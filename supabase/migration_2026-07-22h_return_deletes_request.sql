-- Run once in the Supabase SQL Editor.
-- Return now fully clears the linked request (not just resets file
-- status), so OP needs delete permission on requests too.

drop policy if exists "admins can delete requests" on public.requests;

create policy "op and admin can delete requests"
  on public.requests for delete
  using (public.current_role() in ('op', 'admin'));
