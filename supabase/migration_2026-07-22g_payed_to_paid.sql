-- Run once in the Supabase SQL Editor.
-- Renamed the payment status "Payed" to "Paid" in the app; update any
-- files already marked with the old label so they still match.

update public.files set payment_status = 'Paid' where payment_status = 'Payed';
