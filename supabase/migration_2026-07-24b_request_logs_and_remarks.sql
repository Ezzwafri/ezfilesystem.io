-- Run once in the Supabase SQL Editor.
-- Lets "Incoming Requests (Not In File List)" have its own log
-- history and remarks, matching the file view, before a real files
-- row exists. No RLS changes needed — the existing "op and admin can
-- update requests" and "staff can submit requests" policies already
-- cover these columns since neither restricts by column.

alter table public.requests add column if not exists logs jsonb not null default '[]'::jsonb;
alter table public.requests add column if not exists remarks text not null default '';
