-- Adds promotion audit logging and extends promote_dataset_v2 to log usage
-- Date: 2025-10-17

CREATE TABLE IF NOT EXISTS public.v2_promotion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL,
  promoted_count int NOT NULL,
  deleted_from_staging_count int NOT NULL,
  promoted_by text,
  promoted_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='v2_promotion_logs_dataset_idx'
  ) THEN
    CREATE INDEX v2_promotion_logs_dataset_idx ON public.v2_promotion_logs(dataset_id);
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.promote_dataset_v2(p_dataset uuid, p_promoted_by text DEFAULT NULL)
RETURNS TABLE(promoted int, cleared int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_promoted int := 0;
  v_cleared int := 0;
BEGIN
  WITH up AS (
    INSERT INTO public.v2_content_items (dataset_id, row_uid, subject, body_md, ocd_scope, metadata)
    SELECT dataset_id, row_uid, subject, body_md, ocd_scope, metadata
    FROM public.v2_content_items_staging
    WHERE dataset_id = p_dataset
    ON CONFLICT (dataset_id, row_uid)
    DO UPDATE SET
      subject   = EXCLUDED.subject,
      body_md   = EXCLUDED.body_md,
      ocd_scope = EXCLUDED.ocd_scope,
      metadata  = EXCLUDED.metadata
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_promoted FROM up;

  WITH del AS (
    DELETE FROM public.v2_content_items_staging
    WHERE dataset_id = p_dataset
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_cleared FROM del;

  INSERT INTO public.v2_promotion_logs (dataset_id, promoted_count, deleted_from_staging_count, promoted_by)
  VALUES (p_dataset, v_promoted, v_cleared, p_promoted_by);

  RETURN QUERY SELECT v_promoted, v_cleared;
END;
$$;
