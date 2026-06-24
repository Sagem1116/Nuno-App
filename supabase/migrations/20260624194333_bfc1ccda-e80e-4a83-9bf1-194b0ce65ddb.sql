CREATE OR REPLACE FUNCTION public.get_db_size()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN jsonb_build_object('db_size_bytes', pg_database_size(current_database()));
END;
$$;

REVOKE ALL ON FUNCTION public.get_db_size() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_db_size() FROM anon;
REVOKE ALL ON FUNCTION public.get_db_size() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_size() TO service_role;