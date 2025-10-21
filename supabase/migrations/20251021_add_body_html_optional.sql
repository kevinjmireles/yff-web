-- Add body_html while preserving body_md (prefer HTML, fallback to MD)
-- Migration created: 2025-10-21
-- Purpose: Support HTML-first content authoring with MD fallback

BEGIN;

-- Add body_html to staging table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v2_content_items_staging'
      AND column_name = 'body_html'
  ) THEN
    ALTER TABLE public.v2_content_items_staging
      ADD COLUMN body_html text;
  END IF;
END$$;

-- Add body_html to production table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v2_content_items'
      AND column_name = 'body_html'
  ) THEN
    ALTER TABLE public.v2_content_items
      ADD COLUMN body_html text;
  END IF;
END$$;

-- Add helpful comments
COMMENT ON COLUMN public.v2_content_items_staging.body_html IS
  'Preferred HTML body; personalize/send use body_html first, then body_md as fallback.';

COMMENT ON COLUMN public.v2_content_items.body_html IS
  'Preferred HTML body; personalize/send use body_html first, then body_md as fallback.';

-- Update promote_dataset_v2 function to handle body_html
CREATE OR REPLACE FUNCTION promote_dataset_v2(p_dataset uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  INSERT INTO v2_content_items as ci (id, dataset_id, row_uid, subject, body_md, body_html, ocd_scope, metadata, created_at)
  SELECT gen_random_uuid(), s.dataset_id, s.row_uid, s.subject, s.body_md, s.body_html, s.ocd_scope, coalesce(s.metadata, '{}'::jsonb), now()
  FROM v2_content_items_staging s
  WHERE s.dataset_id = p_dataset
  ON CONFLICT (dataset_id, row_uid) DO UPDATE
    SET subject   = excluded.subject,
        body_md   = excluded.body_md,
        body_html = excluded.body_html,
        ocd_scope = excluded.ocd_scope,
        metadata  = excluded.metadata;
END;
$$;

COMMIT;
