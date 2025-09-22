
-- RLS Policy Stubs (Supabase/Postgres) — v2.1
-- Strategy: admin-only DB access for MVP. Public access goes through API.
-- Later, partner-scoped access can be added via JWT claims (e.g., auth.jwt()->>'partner_id').

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letters ENABLE ROW LEVEL SECURITY;

-- Helper: allow service role (backend) full access
-- Supabase sets `role` claim for service key; alternatively use `is_authenticated()` AND a custom claim.
CREATE POLICY service_role_all_profiles ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_subscriptions ON public.subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_content_items ON public.content_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_geo_metrics ON public.geo_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_officials ON public.officials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_official_contacts ON public.official_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_delivery_history ON public.delivery_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_provider_events ON public.provider_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_delivery_events ON public.delivery_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_campaign_runs ON public.campaign_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_dead_letters ON public.dead_letters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Optional: read-only for authenticated admins via a JWT claim `role=admin`
-- Example of claim check: (auth.jwt() ->> 'role') = 'admin'
CREATE POLICY admin_ro_content_items ON public.content_items
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

-- Future: partner-scoped reads on content and deliveries
-- Requires adding partner_id columns to relevant tables.
-- Example:
-- CREATE POLICY partner_ro_content_items ON public.content_items
--   FOR SELECT TO authenticated
--   USING ((auth.jwt() ->> 'partner_id') IS NOT NULL AND (auth.jwt() ->> 'partner_id')::text = partner_id);

-- Deny-by-default for anonymous (no policies granting anon).

-- Verify
-- SELECT * FROM pg_policies WHERE schemaname='public';
