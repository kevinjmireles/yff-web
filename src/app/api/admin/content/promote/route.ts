/**
 * Admin Content Promote API
 * 
 * Purpose: Promotes content from v2_content_items_staging to v2_content_items
 * Called by: Admin UI content management
 * Security: Admin authentication required
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const promoteSchema = z.object({
  dataset_id: z.string().uuid('Invalid dataset ID format'),
});

export async function POST(request: NextRequest) {
  try {
    // TODO: Add admin authentication check here
    // For now, we'll implement the core functionality
    
    const body = await request.json();
    const { dataset_id } = promoteSchema.parse(body);

    // Call the promote_dataset_v2 RPC function
    const { data, error } = await supabaseAdmin.rpc('promote_dataset_v2', {
      p_dataset: dataset_id
    });

    if (error) {
      console.error('Promote dataset error:', error);
      return NextResponse.json(
        { 
          ok: false, 
          code: 'PROMOTE_ERROR', 
          message: 'Failed to promote dataset',
          details: error.message 
        },
        { status: 500 }
      );
    }

    // Get updated counts from the dataset
    const { data: stagingCount } = await supabaseAdmin
      .from('v2_content_items_staging')
      .select('id', { count: 'exact' })
      .eq('dataset_id', dataset_id);

    const { data: finalCount } = await supabaseAdmin
      .from('v2_content_items')
      .select('id', { count: 'exact' })
      .eq('dataset_id', dataset_id);

    return NextResponse.json({
      ok: true,
      data: {
        dataset_id,
        promoted: true,
        staging_count: stagingCount?.length || 0,
        final_count: finalCount?.length || 0
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

    console.error('Content promote API error:', error);
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
