-- Migration: Change provider_message_id unique constraint to allow same ID for batch
-- Purpose: Support single SendGrid call with multiple recipients (2 credits per batch)
-- Date: 2025-10-17
--
-- Rationale:
-- - SendGrid returns ONE x-message-id per API call, even with multiple recipients
-- - Old constraint: UNIQUE(provider_message_id) prevented assigning same ID to multiple rows
-- - New constraint: UNIQUE(provider_message_id, email) allows batch sends with same ID
-- - Maintains data integrity: each (provider_message_id, email) pair is unique
-- - Keeps cost at 2 credits per batch: 1 SendGrid + 1 Callback
--
-- Safe to run multiple times (idempotent).

-- Drop the old single-column unique index
DROP INDEX IF EXISTS public.ux_delivery_history_provider_message_id;

-- Create new composite unique index: (provider_message_id, email)
-- Still ignores NULLs via WHERE clause
CREATE UNIQUE INDEX IF NOT EXISTS ux_delivery_history_provider_message_id_email
ON public.delivery_history (provider_message_id, email)
WHERE provider_message_id IS NOT NULL;

COMMENT ON INDEX public.ux_delivery_history_provider_message_id_email IS
'Composite unique: allows same provider_message_id for different emails (batch sends). Partial index ignores NULLs.';
