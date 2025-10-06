-- Delivery history indexes to support provider callbacks

-- 01) Unique provider_message_id only when present (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS ux_delivery_history_provider_message_id
ON public.delivery_history (provider_message_id)
WHERE provider_message_id IS NOT NULL;

-- 02) Lookup accelerator for fallback update path
CREATE INDEX IF NOT EXISTS ix_delivery_history_job_batch_email
ON public.delivery_history (job_id, batch_id, email);


