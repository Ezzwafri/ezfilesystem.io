-- Run once in the Supabase SQL Editor.
-- Block NEW duplicate case references going forward, without touching
-- any duplicates that already exist in the table. A plain unique index
-- can't be used here because Postgres validates the *entire* table at
-- creation time and would refuse to build if any duplicates exist —
-- a trigger instead only ever looks at the row being written right now.

create or replace function public.prevent_duplicate_case_reference()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.files
    where lower(trim(case_reference)) = lower(trim(new.case_reference))
      and id <> new.id
  ) then
    raise exception 'A file with this case reference already exists';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_case_reference on public.files;

create trigger trg_prevent_duplicate_case_reference
before insert or update of case_reference on public.files
for each row
execute function public.prevent_duplicate_case_reference();
