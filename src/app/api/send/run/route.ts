/**
 * Send Job Run API
 * 
 * Purpose: Executes a send job with audience targeting and preview generation
 * Called by: Admin UI send management
 * Security: Admin authentication required
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseAudienceRule, executeAudienceRule } from '@/lib/audienceRule';
import { isFeatureEnabled } from '@/lib/features';

const runJobSchema = z.object({
  job_id: z.string().uuid('Invalid job ID format').optional(),
  dataset_id: z.string().uuid('Invalid dataset ID format').optional(),
});

const BATCH_LIMIT = 200;

export async function POST(request: NextRequest) {
  try {
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
    const { job_id, dataset_id } = runJobSchema.parse(body);

    let job;
    
    if (job_id) {
      // Get existing job
      const { data: existingJob, error: jobError } = await supabaseAdmin
        .from('send_jobs')
        .select('*')
        .eq('id', job_id)
        .eq('status', 'pending')
        .single();

      if (jobError || !existingJob) {
        return NextResponse.json(
          { 
            ok: false, 
            code: 'JOB_NOT_FOUND', 
            message: 'Pending job not found' 
          },
          { status: 404 }
        );
      }
      
      job = existingJob;
    } else if (dataset_id) {
      // Create new job for dataset
      const { data: newJob, error: createError } = await supabaseAdmin
        .from('send_jobs')
        .insert({
          dataset_id,
          status: 'pending',
          totals: {}
        })
        .select('*')
        .single();

      if (createError) {
        return NextResponse.json(
          { 
            ok: false, 
            code: 'JOB_CREATE_ERROR', 
            message: 'Failed to create job',
            details: createError.message 
          },
          { status: 500 }
        );
      }
      
      job = newJob;
    } else {
      return NextResponse.json(
        { 
          ok: false, 
          code: 'VALIDATION_ERROR', 
          message: 'Either job_id or dataset_id is required' 
        },
        { status: 400 }
      );
    }

    // Update job status to running
    const { error: updateError } = await supabaseAdmin
      .from('send_jobs')
      .update({ 
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', job.id);

    if (updateError) {
      console.error('Update job status error:', updateError);
    }

    // Get content items for the dataset
    const { data: contentItems, error: contentError } = await supabaseAdmin
      .from('v2_content_items')
      .select('id, subject, body_md, ocd_scope, metadata')
      .eq('dataset_id', job.dataset_id);

    if (contentError) {
      console.error('Get content items error:', contentError);
      return NextResponse.json(
        { 
          ok: false, 
          code: 'CONTENT_ERROR', 
          message: 'Failed to get content items',
          details: contentError.message 
        },
        { status: 500 }
      );
    }

    if (!contentItems || contentItems.length === 0) {
      return NextResponse.json(
        { 
          ok: false, 
          code: 'NO_CONTENT', 
          message: 'No content items found for dataset' 
        },
        { status: 404 }
      );
    }

    // Process each content item
    const totals = {
      inserted: 0,
      parse_errors: 0,
      fallback_used: 0,
      zero_audience: 0,
      skipped: 0,
      samples: {
        bad_rules: [] as string[]
      }
    };

    for (const item of contentItems) {
      try {
        let userIds: string[] = [];
        let usedFallback = false;

        // Check if item has audience_rule
        const audienceRule = item.metadata?.audience_rule;
        if (audienceRule && typeof audienceRule === 'string') {
          try {
            const parsed = parseAudienceRule(audienceRule);
            userIds = await executeAudienceRule(supabaseAdmin, parsed, BATCH_LIMIT);
            
            if (userIds.length === 0) {
              totals.zero_audience++;
            }
          } catch (parseError) {
            console.error('Audience rule parse error:', parseError);
            totals.parse_errors++;
            totals.samples.bad_rules.push(`item_${item.id}`);
            
            // Fall back to ocd_scope
            usedFallback = true;
          }
        }

        // Fallback to ocd_scope if no audience_rule or parsing failed
        if (userIds.length === 0 && (usedFallback || !audienceRule)) {
          if (item.ocd_scope) {
            // Simple ocd_scope matching - this is a simplified version
            // In a real implementation, you'd want more sophisticated matching
            const { data: scopeUsers } = await supabaseAdmin
              .from('v_recipients')
              .select('user_id')
              .contains('ocd_ids', [item.ocd_scope])
              .limit(BATCH_LIMIT);
            
            userIds = scopeUsers?.map(u => u.user_id) || [];
            usedFallback = true;
          } else {
            // No targeting - skip this item
            totals.skipped++;
            continue;
          }
        }

        if (usedFallback) {
          totals.fallback_used++;
        }

        // Insert delivery attempts for matched users (idempotent)
        if (userIds.length > 0) {
          const deliveryAttempts = userIds.map(userId => ({
            send_job_id: job.id,
            user_id: userId,
            content_item_id: item.id,
            status: 'preview' as const
          }));

          // Use upsert with ignoreDuplicates to treat unique violations as success
          const { data: upserted, error: upsertError } = await supabaseAdmin
            .from('delivery_attempts')
            .upsert(deliveryAttempts, {
              onConflict: 'user_id,content_item_id',
              ignoreDuplicates: true,
            })
            .select('user_id');

          if (upsertError) {
            console.error('Upsert delivery attempts error:', upsertError);
            // Continue processing other items
          }

          // Count only rows actually inserted/updated (duplicates ignored)
          if (Array.isArray(upserted)) {
            totals.inserted += upserted.length;
          }
        }

      } catch (itemError) {
        console.error('Error processing content item:', itemError);
        totals.skipped++;
      }
    }

    // Update job with final status and totals
    const { error: finalUpdateError } = await supabaseAdmin
      .from('send_jobs')
      .update({ 
        status: 'completed',
        finished_at: new Date().toISOString(),
        totals
      })
      .eq('id', job.id);

    if (finalUpdateError) {
      console.error('Final job update error:', finalUpdateError);
    }

    return NextResponse.json({
      ok: true,
      data: {
        job_id: job.id,
        dataset_id: job.dataset_id,
        status: 'completed',
        totals,
        processed_items: contentItems.length
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

    console.error('Send run API error:', error);
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
