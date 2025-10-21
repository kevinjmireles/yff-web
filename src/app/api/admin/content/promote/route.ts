/**
 * Admin Content Promote API
 *
 * Purpose: Promotes content from v2_content_items_staging to v2_content_items
 * Called by: Admin UI content management
 * Security: Admin authentication required
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isFeatureEnabled } from '@/lib/features'
import { requireAdmin } from '@/lib/auth'

const promoteSchema = z.object({
  dataset_id: z.string().uuid('Invalid dataset ID format'),
})

const ok = (code: string, data: any) => NextResponse.json({ ok: true, code, data })
const err = (code: string, message: string, details?: any, status = 400) =>
  NextResponse.json({ ok: false, code, message, details }, { status })

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request)
  if (unauthorized) return unauthorized

  if (!isFeatureEnabled('contentPromote')) {
    return err('FEATURE_DISABLED', 'Content promotion is currently disabled', null, 503)
  }

  try {
    const body = await request.json()
    const { dataset_id } = promoteSchema.parse(body)

    const promotedBy = request.headers.get('x-admin-email') ?? 'admin'
    const { data, error } = await supabaseAdmin.rpc('promote_dataset_v2', {
      p_dataset: dataset_id,
      p_promoted_by: promotedBy,
    })

    if (error) {
      console.error('Promote dataset error:', error)
      return err('PROMOTE_ERROR', 'Failed to promote dataset', error.message, 500)
    }

    const { data: stagingCount } = await supabaseAdmin
      .from('v2_content_items_staging')
      .select('id', { count: 'exact' })
      .eq('dataset_id', dataset_id)

    const { data: finalCount } = await supabaseAdmin
      .from('v2_content_items')
      .select('id', { count: 'exact' })
      .eq('dataset_id', dataset_id)

    return ok('PROMOTE_OK', {
      dataset_id,
      promoted: data?.[0]?.promoted ?? 0,
      cleared: data?.[0]?.cleared ?? 0,
      staging_count: stagingCount?.length || 0,
      final_count: finalCount?.length || 0,
      promoted_by: promotedBy,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return err('VALIDATION_ERROR', 'Invalid input data', error.issues)
    }

    console.error('Content promote API error:', error)
    return err('INTERNAL_ERROR', 'Internal server error', null, 500)
  }
}
