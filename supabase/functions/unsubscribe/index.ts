// supabase/functions/unsubscribe/index.ts
// Handles unsubscribe requests with HMAC token validation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEnv } from '../_shared/env.ts';
import { errorResponse, successResponse, checkRateLimit, handleCors, validateUnsubscribeToken, requireSharedSecret } from '../_shared/utils.ts';

interface UnsubscribeRequest {
  token: string;
  email: string;
  list_key?: string;
}

interface UnsubscribeResponse {
  status: 'unsubscribed' | 'noop';
}

Deno.serve(async (request: Request) => {
  try {
    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    
    const env = getEnv(); // throws if misconfigured
    
    // Authentication check
    const unauth = requireSharedSecret(request, env.EDGE_SHARED_SECRET);
    if (unauth) return unauth;
    
    // CORS check
    const corsResponse = handleCors(request, env.CORS_ORIGINS);
    if (corsResponse) return corsResponse;
    
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    // Rate limiting by IP
    const rateLimitOk = await checkRateLimit(clientIP, 'unsubscribe', 5, 15);
    if (!rateLimitOk) {
      return new Response(JSON.stringify(errorResponse('RATE_LIMITED', 'Too many requests')), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Parse request
    if (request.method !== 'POST') {
      return new Response(JSON.stringify(errorResponse('METHOD_NOT_ALLOWED', 'Only POST allowed')), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body: UnsubscribeRequest = await request.json();
    if (!body.token || !body.email) {
      return new Response(JSON.stringify(errorResponse('INVALID_REQUEST', 'Token and email required')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Basic validation
    if (!body.email.includes('@')) {
      return new Response(JSON.stringify(errorResponse('INVALID_REQUEST', 'Invalid email format')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const listKey = body.list_key || 'general';
    
    // Validate list_key
    if (listKey.length < 1 || listKey.length > 50) {
      return new Response(JSON.stringify(errorResponse('INVALID_REQUEST', 'Invalid list_key format')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate HMAC token - CORRECTED implementation
    if (!env.UNSUB_SECRET) {
      console.error('UNSUB_SECRET not configured');
      return new Response(JSON.stringify(errorResponse('CONFIGURATION_ERROR', 'Unsubscribe secret not configured')), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let tokenData: { email: string; list_key: string };
    try {
      tokenData = await validateUnsubscribeToken(body.token, env.UNSUB_SECRET);
    } catch (tokenError) {
      return new Response(JSON.stringify(errorResponse('UNAUTHORIZED', 'Invalid unsubscribe token')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Verify token matches request
    if (tokenData.email !== body.email || tokenData.list_key !== listKey) {
      return new Response(JSON.stringify(errorResponse('UNAUTHORIZED', 'Token mismatch')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Initialize Supabase client
    const supabase = createClient(env.SUPABASE_URL, env.SERVICE_ROLE);
    
    // Get profile - CORRECT field reference
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')  // CORRECT: select user_id, not id
      .eq('email', body.email)
      .single();
    
    if (profileError) {
      console.error('Profile lookup error:', profileError);
      return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to lookup profile')), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check current subscription status - CORRECT field reference
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('unsubscribed_at')
      .eq('user_id', profile.user_id)  // CORRECT: use user_id, not id
      .eq('list_key', listKey)
      .single();
    
    if (subError && subError.code !== 'PGRST116') {
      console.error('Subscription lookup error:', subError);
      return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to lookup subscription')), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let status: 'unsubscribed' | 'noop';
    
    if (!subscription) {
      // Create subscription with unsubscribed status - CORRECT field reference
      const { error: createError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: profile.user_id,  // CORRECT: use user_id, not id
          list_key: listKey,
          unsubscribed_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
      
      if (createError) {
        console.error('Subscription creation error:', createError);
        return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to create subscription')), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      status = 'unsubscribed';
    } else if (subscription.unsubscribed_at) {
      // Already unsubscribed
      status = 'noop';
    } else {
      // Unsubscribe - CORRECT field reference
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          unsubscribed_at: new Date().toISOString()
          // Note: No updated_at field in V2.1 schema
        })
        .eq('user_id', profile.user_id)  // CORRECT: use user_id, not id
        .eq('list_key', listKey);
      
      if (updateError) {
        console.error('Subscription update error:', updateError);
        return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to update subscription')), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      status = 'unsubscribed';
    }
    
    // Return success
    const response: UnsubscribeResponse = { status };
    
    return new Response(JSON.stringify(successResponse(response)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return new Response(JSON.stringify(errorResponse('INTERNAL_ERROR', 'Internal server error')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
