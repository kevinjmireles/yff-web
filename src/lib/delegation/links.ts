// src/lib/delegation/links.ts
import { createClient } from '@supabase/supabase-js'

// Use server-only env vars (guaranteed to be set in server context)
// Fallback to NEXT_PUBLIC_* for backwards compatibility but prefer SUPABASE_URL
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !service) {
  throw new Error('Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
}

const admin = createClient(url, service, { auth: { persistSession: false } })

// Use BASE_URL if available, otherwise fall back to VERCEL_URL or localhost
// Mirrors logic from personalize route for consistency
function getBaseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

/**
 * Idempotently ensure a delegation link exists for the given job.
 * Uses upsert with (email, job_id) unique constraint.
 *
 * @param email - User's email address
 * @param batch_id - Batch identifier
 * @param job_id - Job identifier
 * @returns The delegation URL
 */
export async function ensureDelegationLink(
  email: string,
  batch_id: string,
  job_id: string
): Promise<string> {
  const baseUrl = getBaseUrl()
  const link = `${baseUrl}/delegate?job_id=${job_id}&batch_id=${batch_id}&email=${encodeURIComponent(email)}`

  const { data, error } = await admin
    .from('delegation_links')
    .upsert(
      { email, url: link, batch_id, job_id },
      { onConflict: 'email,job_id', ignoreDuplicates: true }
    )
    .select('url')
    .single()

  if (error && error.code !== '23505') {
    // 23505 = unique violation (already present), we'll use fallback
    throw error
  }

  return data?.url ?? link
}

/**
 * Retrieve the delegation link for a given email and job.
 * Used by token resolution to populate [[DELEGATION]] tokens.
 *
 * Filters by job_id first to ensure we return the correct link for the current job,
 * preventing cross-job contamination when an email has multiple delegation links.
 *
 * @param email - User's email address
 * @param job_id - Job identifier to filter by
 * @returns The delegation URL for this job, or null if none found
 */
export async function latestDelegationUrl(email: string, job_id: string): Promise<string | null> {
  const { data, error } = await admin
    .from('delegation_links')
    .select('url')
    .eq('email', email)
    .eq('job_id', job_id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0]?.url ?? null
}
