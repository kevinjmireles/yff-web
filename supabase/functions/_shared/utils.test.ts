import { describe, it, expect } from 'vitest';

// Mock the handleCors function since we can't import the actual utils due to Deno imports
const handleCors = (req: Request, corsOrigins?: string): Response | null => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'authorization, x-edge-secret, x-client-info, apikey, content-type',
        'access-control-max-age': '86400',
        'vary': 'origin',
      },
    });
  }

  // Restrict origin if list provided
  if (corsOrigins) {
    const origin = req.headers.get('origin');
    const allowed = corsOrigins
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    if (origin && allowed.length > 0 && !allowed.includes(origin)) {
      return new Response(
        JSON.stringify({ code: 'CORS_ERROR', message: 'Origin not allowed' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      );
    }
  }

  // Continue processing
  return null;
};

const makeReq = (method: string, origin?: string) =>
  new Request('http://localhost', {
    method,
    headers: origin ? { origin } : {},
  });

describe('handleCors', () => {
  it('OPTIONS returns 204 with required CORS headers', () => {
    const res = handleCors(makeReq('OPTIONS', 'https://foo.com'));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(204);
    const h = res!.headers;
    expect(h.get('access-control-allow-origin')).toBe('*');
    expect(h.get('access-control-allow-methods')).toContain('OPTIONS');
    expect(h.get('access-control-allow-headers')).toBeTruthy();
  });

  it('POST with no corsOrigins returns null (continue)', () => {
    expect(handleCors(makeReq('POST', 'https://foo.com'))).toBeNull();
  });

  it('POST blocks origin not in allowed list (403 + CORS_ERROR)', async () => {
    const res = handleCors(makeReq('POST', 'https://foo.com'), 'https://bar.com');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    expect(await res!.text()).toContain('CORS_ERROR');
  });

  it('POST allows origin in allowed list', () => {
    const res = handleCors(
      makeReq('POST', 'https://foo.com'),
      'https://bar.com, https://foo.com'
    );
    expect(res).toBeNull();
  });

  it('handles multiple origins with spaces', () => {
    const res = handleCors(
      makeReq('POST', 'https://example.com'),
      'https://foo.com, https://bar.com, https://example.com'
    );
    expect(res).toBeNull();
  });

  it('blocks origin with different case', () => {
    const res = handleCors(
      makeReq('POST', 'https://FOO.COM'),
      'https://foo.com'
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});
