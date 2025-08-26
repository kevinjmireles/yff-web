// Purpose: Next.js API route proxy for profile-address Edge Function.
// Called by: Signup form to enrich address and create profile.
// Security: Validates input with Zod, calls Edge Function with shared secret.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { callEdge, generateRequestId, createErrorResponse, createSuccessResponse } from '@/lib/edge';

const profileAddressSchema = z.object({
  email: z.string().email(),
  address: z.string().min(10),
  name: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = profileAddressSchema.parse(body);
    
    const requestId = generateRequestId();
    const response = await callEdge('profile-address', validatedData, requestId);
    
    if (!response.ok) {
      const errorData = await response.json();
      return createErrorResponse(
        errorData.message || 'Profile address update failed',
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
    
    console.error('Profile address API error:', error);
    return createErrorResponse(
      'Internal server error',
      'INTERNAL_ERROR',
      500
    );
  }
}
