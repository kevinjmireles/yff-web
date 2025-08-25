// supabase/functions/_shared/env.ts
// Reads non-reserved env names (SB_URL / SB_SERVICE_ROLE_KEY). Falls back if platform provides SUPABASE_*.
export function getEnv() {
  const SB_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL"); // fallback if present
  const SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const CIVIC_API_KEY = Deno.env.get("CIVIC_API_KEY");
  const UNSUB_SECRET = Deno.env.get("UNSUB_SECRET");
  const EDGE_SHARED_SECRET = Deno.env.get("EDGE_SHARED_SECRET") || "";
  const CORS_ORIGINS = Deno.env.get("CORS_ORIGINS") || "";
  if (!SB_URL || !SERVICE_ROLE) throw new Error("Missing SB_URL or SB_SERVICE_ROLE_KEY");
  return { SUPABASE_URL: SB_URL, SERVICE_ROLE, CIVIC_API_KEY, UNSUB_SECRET, EDGE_SHARED_SECRET, CORS_ORIGINS };
}
