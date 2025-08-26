// Purpose: Shared helper for Next.js API routes to call Supabase Edge Functions securely.
// Called by: API routes that need to proxy requests to Edge Functions.
// Security: Uses x-edge-secret header for authentication between Next.js and Edge Functions.

const edgeBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.supabase.co/functions/v1');

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function callEdge(
  functionName: string, 
  body: any, 
  requestId: string
): Promise<Response> {
  if (!edgeBaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured');
  }

  const url = `${edgeBaseUrl}/${functionName}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-edge-secret': process.env.EDGE_SHARED_SECRET || '',
        'x-request-id': requestId,
      },
      body: JSON.stringify(body),
    });

    return response;
  } catch (error) {
    console.error(`Edge function ${functionName} call failed:`, error);
    throw new Error(`Failed to call edge function: ${error}`);
  }
}

export function createErrorResponse(message: string, code: string = 'INTERNAL_ERROR', status: number = 500) {
  return Response.json(
    { ok: false, code, message, details: null },
    { status }
  );
}

export function createSuccessResponse(data: any, status: number = 200) {
  return Response.json(
    { ok: true, data },
    { status }
  );
}
