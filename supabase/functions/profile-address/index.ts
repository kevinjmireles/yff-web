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
    
    // Call Google Civic API to get OCD IDs - HARDENED implementation
    let ocdIds: string[] = [];
    let zipcode = '';
    
    try {
      if (env.CIVIC_API_KEY) {
        // Sanitize address input
        const sanitizedAddress = String(body.address || "")
          .replace(/^\s*address[:\s]*/i, "") // drop "Address" prefix if present
          .replace(/\s+/g, " ")
          .trim();
        
        if (!sanitizedAddress) {
          console.error('Address sanitization resulted in empty string');
          return new Response(JSON.stringify(errorResponse('INVALID_REQUEST', 'Address cannot be empty')), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Use Google Civic v2 divisionsByAddress endpoint with timeout
        const url = new URL("https://civicinfo.googleapis.com/civicinfo/v2/divisionsByAddress");
        url.searchParams.set("address", sanitizedAddress);
        url.searchParams.set("key", env.CIVIC_API_KEY);
        
        // Fetch with timeout protection
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000); // 7 second timeout
        
        const civicResponse = await fetch(url.toString(), {
          headers: { accept: "application/json" },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!civicResponse.ok) {
          const text = await civicResponse.text().catch(() => "");
          console.error('Civic API error:', civicResponse.status, text);
          return new Response(JSON.stringify(errorResponse('CIVIC_API_ERROR', `Civic API error: ${civicResponse.status}`)), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        const civicData = await civicResponse.json();
        
        // Extract OCD IDs from divisions with proper validation
        if (!civicData?.divisions || civicData.divisions.length === 0) {
          console.warn('No divisions found for address:', sanitizedAddress);
          ocdIds = [];
        } else {
          ocdIds = civicData.divisions.map((div: any) => div.ocdId);
        }
        
        // Extract zipcode from normalized input or fallback to address parsing
        zipcode = civicData?.normalizedInput?.zip ?? 
                 (sanitizedAddress.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) ?? '');
        
        console.log(`Civic API success: found ${ocdIds.length} OCD IDs, zipcode: ${zipcode}`);
      } else {
        console.warn('CIVIC_API_KEY not configured, skipping Civic API enrichment');
      }
    } catch (civicError) {
      console.error('Civic API exception:', civicError);
      // Continue without Civic data - don't fail the entire request
    }
    
    // CORRECT profile upsert with V2.1 schema fields
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        email: body.email,
        address: sanitizedAddress,
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
