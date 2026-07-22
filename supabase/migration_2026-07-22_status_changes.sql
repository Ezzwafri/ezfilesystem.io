-- Run once in the Supabase SQL Editor to match the updated app:
-- files no longer default to "Pending" status, and payment status
-- renamed "Payment" -> "Payed".

alter table public.files alter column status drop default;
alter table public.files alter column status drop not null;

update public.files set status = null where status = 'Pending';
update public.files set payment_status = 'Payed' where payment_status = 'Payment';
