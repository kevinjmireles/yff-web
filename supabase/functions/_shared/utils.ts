// supabase/functions/_shared/utils.ts
// Shared utilities for Edge functions: rate limiting, CORS, error handling

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ErrorResponse {
  ok: false;
  code: string;
  message: string;
  details?: any;
}

export interface SuccessResponse<T = any> {
  ok: true;
  data: T;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

export function errorResponse(code: string, message: string, details?: any): ErrorResponse {
  return { ok: false, code, message, details };
}

export function successResponse<T>(data: T): SuccessResponse<T> {
  return { ok: true, data };
}

// Rate limiting via database
export async function checkRateLimit(ip: string, endpoint: string, maxAttempts: number = 5, windowMinutes: number = 15): Promise<boolean> {
  try {
    const { SUPABASE_URL, SERVICE_ROLE } = await import('./env.js').then(m => m.getEnv());
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    
    const now = new Date();
    const windowStart = new Date(now.getTime() - (windowMinutes * 60 * 1000));
    
    // Check recent attempts by IP
    const { data: recentAttempts, error } = await supabase
      .from('rate_limit_hits')
      .select('created_at')
      .eq('ip_address', ip)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Rate limit check failed:', error);
      return true; // Allow if we can't check
    }
    
    if (recentAttempts && recentAttempts.length >= maxAttempts) {
      return false; // Rate limited
    }
    
    // Log this attempt
    await supabase
      .from('rate_limit_hits')
      .insert({
        ip_address: ip,
        endpoint,
        created_at: now.toISOString()
      });
    
    return true; // Allow
  } catch (error) {
    console.error('Rate limit check error:', error);
    return true; // Allow if we can't check
  }
}

// CORS handling
export function handleCors(request: Request, corsOrigins: string): Response | null {
  const origin = request.headers.get('origin');
  const allowedOrigins = corsOrigins.split(',').map(o => o.trim()).filter(Boolean);
  
  if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify(errorResponse('CORS_ERROR', 'Origin not allowed')), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null; // Continue processing
}

// HMAC validation for unsubscribe tokens - CORRECTED implementation
export async function validateUnsubscribeToken(token: string, secret: string): Promise<{ email: string; list_key: string }> {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) throw new Error("bad token");
    
    // Decode payload
    const payloadBytes = b64urlToBytes(payloadB64);
    const json = new TextDecoder().decode(payloadBytes);
    const parsed = JSON.parse(json);
    
    // Verify HMAC
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), 
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
    
    // Compare signatures
    if (!ctEqual(mac, b64urlToBytes(sigB64))) throw new Error("bad signature");
    
    return parsed;
  } catch (error) {
    console.error('Token validation error:', error);
    throw new Error('Invalid token');
  }
}

// Helper function to convert base64url to bytes
function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const b64Padded = b64 + padding;
  return new Uint8Array(atob(b64Padded).split('').map(c => c.charCodeAt(0)));
}

// Helper function for constant-time comparison
function ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// Helper function to generate unsubscribe tokens
export async function generateUnsubscribeToken(email: string, list_key: string, secret: string): Promise<string> {
  const payload = JSON.stringify({ email, list_key });
  const payloadB64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hmac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hmacB64 = btoa(String.fromCharCode(...new Uint8Array(hmac)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  return `${payloadB64}.${hmacB64}`;
}
