-- Make provider_message_id usable for ON CONFLICT in Postgres/Supabase

-- (A) Drop the prior partial unique index (if it exists)
DROP INDEX IF EXISTS ux_delivery_history_provider_message_id;

-- (B) Create a plain UNIQUE index (Postgres allows multiple NULLs by default)
CREATE UNIQUE INDEX ux_delivery_history_provider_message_id
ON public.delivery_history (provider_message_id);

-- (C) Keep/ensure the fallback lookup accelerator
CREATE INDEX IF NOT EXISTS ix_delivery_history_job_batch_email
ON public.delivery_history (job_id, batch_id, email);


