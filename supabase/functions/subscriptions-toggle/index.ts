// supabase/functions/subscriptions-toggle/index.ts
// Toggles subscription status (subscribed/unsubscribed)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEnv } from '../_shared/env.ts';
import { errorResponse, successResponse, checkRateLimit, handleCors, requireSharedSecret } from '../_shared/utils.ts';

interface SubscriptionToggleRequest {
  email: string;
  list_key?: string;
}

interface SubscriptionToggleResponse {
  list_key: string;
  status: 'subscribed' | 'unsubscribed';
}

Deno.serve(async (request: Request) => {
  try {
    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    
    const env = getEnv(); // throws if misconfigured
    
    // Authentication check
    const auth = requireSharedSecret(request, env.EDGE_SHARED_SECRET);
    if (!auth.ok) return auth.response;
    
    // CORS check
    const corsResponse = handleCors(request, env.CORS_ORIGINS);
    if (corsResponse) return corsResponse;
    
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    // Rate limiting by IP
    const rateLimitOk = await checkRateLimit(clientIP, 'subscriptions-toggle', 10, 15);
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
    
    const body: SubscriptionToggleRequest = await request.json();
    if (!body.email) {
      return new Response(JSON.stringify(errorResponse('INVALID_REQUEST', 'Email required')), {
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
    
    // Initialize Supabase client
    const supabase = createClient(env.SUPABASE_URL, env.SERVICE_ROLE);
    
    // Get or create profile - CORRECT field reference
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')  // CORRECT: select user_id, not id
      .eq('email', body.email)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile lookup error:', profileError);
      return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to lookup profile')), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create profile if it doesn't exist - CORRECT fields
    if (!profile) {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          email: body.email,
          address: '',  // Required field, will be updated later
          zipcode: '',  // Required field, will be updated later
          ocd_ids: [],  // Required field, will be updated later
          ocd_last_verified_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select('user_id')  // CORRECT: select user_id, not id
        .single();
      
      if (createError) {
        console.error('Profile creation error:', createError);
        return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to create profile')), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      profile = newProfile;
    }
    
    // Get current subscription status - CORRECT field reference
    let { data: subscription, error: subError } = await supabase
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
    
    // Toggle subscription status
    const now = new Date().toISOString();
    let newStatus: 'subscribed' | 'unsubscribed';
    
    if (!subscription) {
      // Create new subscription (subscribed) - CORRECT field reference
      const { error: createSubError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: profile.user_id,  // CORRECT: use user_id, not id
          list_key: listKey,
          unsubscribed_at: null,
          created_at: now
        });
      
      if (createSubError) {
        console.error('Subscription creation error:', createSubError);
        return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to create subscription')), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      newStatus = 'subscribed';
    } else {
      // Toggle existing subscription
      const isCurrentlySubscribed = !subscription.unsubscribed_at;
      const newUnsubscribedAt = isCurrentlySubscribed ? now : null;
      
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          unsubscribed_at: newUnsubscribedAt
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
      
      newStatus = isCurrentlySubscribed ? 'unsubscribed' : 'subscribed';
    }
    
    // Return success
    const response: SubscriptionToggleResponse = {
      list_key: listKey,
      status: newStatus
    };
    
    return new Response(JSON.stringify(successResponse(response)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Subscription toggle error:', error);
    return new Response(JSON.stringify(errorResponse('INTERNAL_ERROR', 'Internal server error')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
