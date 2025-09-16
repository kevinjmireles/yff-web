// Purpose: Server-side Supabase admin client for bypassing RLS
// Called by: API routes that need to write to database without user authentication
// Note: This client uses service role key and bypasses RLS policies

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Server-side Supabase env not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Project Settings'
  );
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
