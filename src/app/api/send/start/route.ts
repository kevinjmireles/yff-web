/**
 * Send Job Start API
 * 
 * Purpose: Creates a new send job in pending status
 * Called by: Admin UI send management
 * Security: Admin authentication required
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isFeatureEnabled } from '@/lib/features';
import { requireAdmin } from '@/lib/auth';
import { jsonErrorWithId } from '@/lib/api';

const startJobSchema = z.object({
  dataset_id: z.string().uuid('Invalid dataset ID format'),
  created_by: z.string().uuid('Invalid user ID format').optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Admin auth guard
    const unauthorized = requireAdmin(request);
    if (unauthorized) return unauthorized;
    // Feature flag check
    if (!isFeatureEnabled('sendRun')) {
      return jsonErrorWithId(request, 'FEATURE_DISABLED', 'Send functionality is currently disabled', 503);
    }

    // TODO: Add admin authentication check here
    // For now, we'll implement the core functionality
    
    const body = await request.json();
    const { dataset_id, created_by } = startJobSchema.parse(body);

    // Verify dataset exists
    const { data: dataset, error: datasetError } = await supabaseAdmin
      .from('content_datasets')
      .select('id, name')
      .eq('id', dataset_id)
      .single();

    if (datasetError || !dataset) {
      return jsonErrorWithId(request, 'DATASET_NOT_FOUND', 'Dataset not found', 404);
    }

    // Create new send job
    const { data: job, error: jobError } = await supabaseAdmin
      .from('send_jobs')
      .insert({
        dataset_id,
        created_by,
        status: 'pending',
        totals: {}
      })
      .select('id, dataset_id, status, created_at')
      .single();

    if (jobError) {
      console.error('Create send job error:', jobError);
      return jsonErrorWithId(request, 'JOB_CREATE_ERROR', 'Failed to create send job', 500, jobError.message);
    }

    return NextResponse.json({
      ok: true,
      data: {
        job_id: job.id,
        dataset_id: job.dataset_id,
        status: job.status,
        created_at: job.created_at
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonErrorWithId(request, 'VALIDATION_ERROR', 'Invalid input data', 400, error.errors);
    }

    console.error('Send start API error:', error);
    return jsonErrorWithId(request, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}
