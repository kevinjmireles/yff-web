-- Migration: Content Import MVP - Case-Insensitive Dataset Index
-- Purpose: Adds unique case-insensitive index on content_datasets.name
-- Date: 2025-10-10
-- 
-- Note: This migration does NOT create new tables. It only adds an index
-- to support case-insensitive dataset name lookups. The content import
-- feature writes to the existing v2_content_items table.
--
-- Safe to run multiple times (idempotent).

-- Case-insensitive uniqueness on dataset name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='content_datasets_name_lower'
  ) THEN
    CREATE UNIQUE INDEX content_datasets_name_lower ON public.content_datasets (LOWER(name));
  END IF;
END$$;

COMMENT ON INDEX public.content_datasets_name_lower IS 'Case-insensitive unique constraint on dataset name for content import';
