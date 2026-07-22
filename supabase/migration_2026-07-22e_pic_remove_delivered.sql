-- Run once in the Supabase SQL Editor.
-- Lets a PIC remove their own delivered requests from their Delivered
-- list (self-service cleanup) without granting broader delete access.

create policy "pic can remove own delivered requests"
  on public.requests for delete
  using (
    public.current_role() = 'pic'
    and requested_by = auth.uid()
    and status = 'Delivered'
  );
