// Purpose: Next.js API route proxy for unsubscribe Edge Function.
// Called by: Unsubscribe page to securely unsubscribe users.
// Security: Validates HMAC token, calls Edge Function with shared secret.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { callEdge, generateRequestId, createErrorResponse, createSuccessResponse } from '@/lib/edge';

const unsubscribeSchema = z.object({
  token: z.string().min(1),
  list_key: z.string().default('general'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = unsubscribeSchema.parse(body);
    
    const requestId = generateRequestId();
    const response = await callEdge('unsubscribe', validatedData, requestId);
    
    if (!response.ok) {
      const errorData = await response.json();
      return createErrorResponse(
        errorData.message || 'Unsubscribe failed',
        errorData.code || 'EDGE_FUNCTION_ERROR',
        response.status
      );
    }
    
    const result = await response.json();
    return createSuccessResponse(result.data);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(
        'Invalid input data',
        'VALIDATION_ERROR',
        400
      );
    }
    
    console.error('Unsubscribe API error:', error);
    return createErrorResponse(
      'Internal server error',
      'INTERNAL_ERROR',
      500
    );
  }
}
