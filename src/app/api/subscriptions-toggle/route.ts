// Purpose: Next.js API route proxy for subscriptions-toggle Edge Function.
// Called by: Preferences page to toggle subscription status.
// Security: Validates input with Zod, calls Edge Function with shared secret.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { callEdge, generateRequestId, createErrorResponse, createSuccessResponse } from '@/lib/edge';

const subscriptionToggleSchema = z.object({
  email: z.string().email(),
  list_key: z.string().default('general'),
  action: z.enum(['subscribe', 'unsubscribe']),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = subscriptionToggleSchema.parse(body);
    
    const requestId = generateRequestId();
    const response = await callEdge('subscriptions-toggle', validatedData, requestId);
    
    if (!response.ok) {
      const errorData = await response.json();
      return createErrorResponse(
        errorData.message || 'Subscription toggle failed',
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
    
    console.error('Subscription toggle API error:', error);
    return createErrorResponse(
      'Internal server error',
      'INTERNAL_ERROR',
      500
    );
  }
}
