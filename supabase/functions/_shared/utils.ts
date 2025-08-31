// supabase/functions/_shared/utils.ts
// Shared utilities for Edge functions: rate limiting, CORS, error handling

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supported quote characters: ASCII double + single, backtick, and curly pairs
const QUOTE_CHARS = new Set(['"', "'", '\u201C', '\u201D', '\u2018', '\u2019', '`']);

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

// Enhanced CORS handling for Edge Functions
export function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'authorization, x-edge-secret, x-client-info, apikey',
        'access-control-max-age': '86400',
      },
    });
  }
  return null;
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

// Helper functions for authentication
function safeJsonHeaders() {
  return {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-edge-secret, x-client-info, apikey',
  };
}

function stripSurroundingQuotes(s: string) {
  if (s.length < 2) return s;
  const first = s[0];
  const last = s[s.length - 1];
  if (!QUOTE_CHARS.has(first) || !QUOTE_CHARS.has(last)) return s;

  // Only strip when they form a proper pair or are identical
  if (
    first === last ||
    (first === '\u201C' && last === '\u201D') || // " … "
    (first === '\u2018' && last === '\u2019')    // ' … '
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function normalizeAuthHeaderValue(raw: string): string {
  let v = (raw || '').trim();

  // Remove Bearer prefix if present (case-insensitive)
  if (v.toLowerCase().startsWith('bearer ')) {
    v = v.slice(7);
  }

  v = v.trim();

  // Strip outermost quotes using the safe helper
  v = stripSurroundingQuotes(v);

  // Strip zero-width characters just in case
  v = v.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  return v;
}

// Enhanced authentication helper for Edge Functions
export function requireSharedSecret(req: Request, secretEnv: string) {
  // Try common header spellings
  const candidate =
    req.headers.get('x-edge-secret') ??
    req.headers.get('X-Edge-Secret') ??
    req.headers.get('authorization') ??
    req.headers.get('Authorization') ??
    '';

  const hadHeader = !!candidate;
  const headerToken = normalizeAuthHeaderValue(candidate);
  const envSecret = (secretEnv || '').trim();

  // Optional safe debug (no secret values printed)
  if (Deno.env.get('DEBUG_EDGE_AUTH') === '1') {
    console.log({
      hasHeader: hadHeader,
      headerLen: headerToken.length,
      secretLen: envSecret.length,
    });
  }

  if (!hadHeader) {
    return {
      ok: false as const,
      response: new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        { status: 401, headers: safeJsonHeaders() }
      ),
    };
  }

  // You can keep 401 here (no info leak); 403 is also defensible.
  if (!envSecret || headerToken !== envSecret) {
    return {
      ok: false as const,
      response: new Response(
        JSON.stringify({ code: 401, message: 'Invalid authorization header' }),
        { status: 401, headers: safeJsonHeaders() }
      ),
    };
  }

  return { ok: true as const };
}
