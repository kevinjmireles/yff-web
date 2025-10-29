// src/lib/personalize/tokens.ts
import { latestDelegationUrl } from '@/lib/delegation/links'

export type TokenContext = {
  email: string
  job_id: string
  batch_id?: string
  // Add other context fields as needed (city, state, first_name, etc.)
}

/**
 * Replace tokens with dynamic content.
 * Supports: [[DELEGATION]], [[EMAIL]], [[JOB_ID]], [[BATCH_ID]]
 *
 * BREAKING CHANGE: This function is now async due to delegation link DB lookup.
 * All callers must await this function.
 *
 * @param html - HTML string containing tokens to replace
 * @param ctx - Context object with user/job information (job_id is required for delegation lookups)
 * @returns Promise resolving to HTML with tokens replaced
 */
export async function resolveTokens(html: string, ctx: TokenContext): Promise<string> {
  let out = html ?? ''

  // [[DELEGATION]] - fetch from database (single source of truth)
  // Filters by job_id to ensure we return the correct link for this job
  if (out.includes('[[DELEGATION]]')) {
    const url = await latestDelegationUrl(ctx.email, ctx.job_id)
    const replacement = url
      ? `<p>If you can't email right now, you can <a href="${url}" target="_blank" rel="noopener noreferrer">delegate this action</a>.</p>`
      : `<p><em>delegation link unavailable</em></p>`
    out = out.replace(/\[\[DELEGATION\]\]/g, replacement)
  }

  // [[EMAIL]] - user's email address
  out = out.replace(/\[\[EMAIL\]\]/g, ctx.email)

  // [[JOB_ID]] - current job identifier
  out = out.replace(/\[\[JOB_ID\]\]/g, ctx.job_id)

  // [[BATCH_ID]] - current batch identifier
  if (ctx.batch_id) {
    out = out.replace(/\[\[BATCH_ID\]\]/g, ctx.batch_id)
  }

  // TODO: Add more tokens here as needed
  // Examples: [[FIRST_NAME]], [[CITY]], [[STATE]], etc.

  return out
}
