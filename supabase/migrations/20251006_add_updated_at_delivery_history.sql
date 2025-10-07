-- Temporary safety column to satisfy Supabase schema cache and avoid update errors
-- Adds updated_at as a nullable timestamptz if it does not already exist

ALTER TABLE public.delivery_history
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NULL;


