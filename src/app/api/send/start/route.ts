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
      return NextResponse.json(
        { 
          ok: false, 
          code: 'FEATURE_DISABLED', 
          message: 'Send functionality is currently disabled' 
        },
        { status: 503 }
      );
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
      return NextResponse.json(
        { 
          ok: false, 
          code: 'DATASET_NOT_FOUND', 
          message: 'Dataset not found' 
        },
        { status: 404 }
      );
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
      return NextResponse.json(
        { 
          ok: false, 
          code: 'JOB_CREATE_ERROR', 
          message: 'Failed to create send job',
          details: jobError.message 
        },
        { status: 500 }
      );
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
      return NextResponse.json(
        { 
          ok: false, 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid input data',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    console.error('Send start API error:', error);
    return NextResponse.json(
      { 
        ok: false, 
        code: 'INTERNAL_ERROR', 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
