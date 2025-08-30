// supabase/functions/profile-address/index.ts
// Updates user profile with address and ensures subscription exists

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getEnv } from '../_shared/env.ts';
import { errorResponse, successResponse, checkRateLimit, handleCors, requireSharedSecret } from '../_shared/utils.ts';

interface ProfileAddressRequest {
  email: string;
  address: string;
}

interface ProfileAddressResponse {
  zipcode: string;
  ocd_ids: string[];
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
    const rateLimitOk = await checkRateLimit(clientIP, 'profile-address', 10, 15);
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
    
    const body: ProfileAddressRequest = await request.json();
    if (!body.email || !body.address) {
      return new Response(JSON.stringify(errorResponse('INVALID_REQUEST', 'Email and address required')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Basic validation
    if (!body.email.includes('@') || body.address.length < 10) {
      return new Response(JSON.stringify(errorResponse('INVALID_REQUEST', 'Invalid email or address format')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Initialize Supabase client
    const supabase = createClient(env.SUPABASE_URL, env.SERVICE_ROLE);
    
    // Call Google Civic API to get OCD IDs - CORRECTED implementation
    let ocdIds: string[] = [];
    let zipcode = '';
    
    try {
      if (env.CIVIC_API_KEY) {
        const civicResponse = await fetch(
          `https://www.googleapis.com/civicinfo/v2/divisionsByAddress?address=${encodeURIComponent(body.address)}&key=${env.CIVIC_API_KEY}`
        );
        
        if (civicResponse.ok) {
          const civicData = await civicResponse.json();
          
          // CORRECT data extraction from divisionsByAddress
          if (civicData.divisions) {
            ocdIds = Object.keys(civicData.divisions);
          }
          
          // CORRECT zipcode extraction
          if (civicData.normalizedInput?.zip) {
            zipcode = civicData.normalizedInput.zip;
          }
        }
      }
    } catch (civicError) {
      console.error('Civic API error:', civicError);
      // Continue without Civic data
    }
    
    // CORRECT profile upsert with V2.1 schema fields
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        email: body.email,
        address: body.address,
        zipcode,
        ocd_ids: ocdIds,
        ocd_last_verified_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }, {
        onConflict: 'email'
      })
      .select('user_id')  // CORRECT: select user_id, not id
      .single();
    
    if (profileError) {
      console.error('Profile upsert error:', profileError);
      return new Response(JSON.stringify(errorResponse('DATABASE_ERROR', 'Failed to update profile')), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // CORRECT subscription creation with user_id
    const { error: subscriptionError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: profile.user_id,  // CORRECT: use user_id, not id
        list_key: 'general',
        unsubscribed_at: null,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,list_key'
      });
    
    if (subscriptionError) {
      console.error('Subscription upsert error:', subscriptionError);
      // Continue - profile was updated successfully
    }
    
    // Return success
    const response: ProfileAddressResponse = {
      zipcode,
      ocd_ids: ocdIds
    };
    
    return new Response(JSON.stringify(successResponse(response)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Profile address error:', error);
    return new Response(JSON.stringify(errorResponse('INTERNAL_ERROR', 'Internal server error')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
