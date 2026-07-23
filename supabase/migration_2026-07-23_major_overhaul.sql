-- Run once in the Supabase SQL Editor.
-- Major overhaul: lawyer/partner roles, use type, endorsed by,
-- return request flow, new payment statuses, updated RPCs.

-- 1. Add new columns to files and requests
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS use_type text;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS endorsed_by_name text;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS endorsed_by_name text;

-- 2. Update profiles role constraint for lawyer/partner
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'op', 'lawyer', 'partner'));

-- 3. Update request INSERT policy for lawyer/partner
DROP POLICY IF EXISTS "pic and admin can submit requests" ON public.requests;
CREATE POLICY "staff can submit requests"
  ON public.requests FOR INSERT
  WITH CHECK (
    public.current_role() IN ('lawyer', 'partner', 'admin')
    AND requested_by = auth.uid()
  );

-- 4. Update request DELETE policy for lawyer/partner
DROP POLICY IF EXISTS "pic can remove own requests" ON public.requests;
CREATE POLICY "lawyer partner can remove own requests"
  ON public.requests FOR DELETE
  USING (
    public.current_role() IN ('lawyer', 'partner')
    AND requested_by = auth.uid()
  );

-- 5. Drop old RPCs
DROP FUNCTION IF EXISTS public.log_file_request(text, text, text);
DROP FUNCTION IF EXISTS public.pic_return_file(text, text, text);
DROP FUNCTION IF EXISTS public.set_file_requester(text, uuid, text);

-- 6. New log_file_request: sets all request fields on file + logs
CREATE OR REPLACE FUNCTION public.log_file_request(
  p_case_reference text, p_time text, p_by text,
  p_requested_by uuid, p_requested_by_name text,
  p_use_type text, p_endorsed_by_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  v_action := 'status changed to "Requested" — ' || p_use_type;
  IF p_endorsed_by_name IS NOT NULL AND p_endorsed_by_name <> '' THEN
    v_action := v_action || ' — Endorsed by: ' || p_endorsed_by_name;
  END IF;
  UPDATE public.files
  SET logs = logs || jsonb_build_object('time', p_time, 'action', v_action, 'by', p_by),
      requested_by = p_requested_by,
      requested_by_name = p_requested_by_name,
      use_type = p_use_type,
      endorsed_by_name = NULLIF(p_endorsed_by_name, '')
  WHERE lower(trim(case_reference)) = lower(trim(p_case_reference))
    AND public.current_role() IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_file_request(text, text, text, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_file_request(text, text, text, uuid, text, text, text) TO authenticated;

-- 7. pic_cancel_request: clears request fields on file + logs cancel
CREATE OR REPLACE FUNCTION public.pic_cancel_request(p_case_reference text, p_time text, p_by text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.files
  SET status = NULL, payment_status = NULL,
      requested_by = NULL, requested_by_name = NULL,
      use_type = NULL, endorsed_by_name = NULL,
      logs = logs || jsonb_build_object('time', p_time, 'action', 'Request cancelled', 'by', p_by)
  WHERE lower(trim(case_reference)) = lower(trim(p_case_reference))
    AND public.current_role() IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.pic_cancel_request(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pic_cancel_request(text, text, text) TO authenticated;

-- 8. pic_request_return: PIC sets file status to Return (only if paid)
CREATE OR REPLACE FUNCTION public.pic_request_return(p_case_reference text, p_time text, p_by text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.files
  SET status = 'Return',
      logs = logs || jsonb_build_object('time', p_time, 'action', 'status changed to "Return"', 'by', p_by)
  WHERE lower(trim(case_reference)) = lower(trim(p_case_reference))
    AND requested_by = auth.uid()
    AND payment_status = 'Paid to Ezzreca'
    AND public.current_role() IN ('lawyer', 'partner');
END;
$$;

REVOKE ALL ON FUNCTION public.pic_request_return(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pic_request_return(text, text, text) TO authenticated;
