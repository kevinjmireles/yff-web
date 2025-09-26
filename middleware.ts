import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  // Protect admin UI and all APIs so we can enforce test-access gate in prod
  matcher: ['/admin/:path*', '/api/:path*'],
};

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const existingReqId = req.headers.get('x-request-id') || req.headers.get('x-correlation-id');
  const requestId = existingReqId || crypto.randomUUID();

  // ---------- Test Access Gate (prod-only by default) ----------
  // Allow assets and Next internals quickly
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/assets')
  ) {
    const res = NextResponse.next();
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // Only guard our matchers; early return otherwise (defensive)
  const isProtected = pathname.startsWith('/admin') || pathname.startsWith('/api');
  if (!isProtected) {
    const res = NextResponse.next();
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  if (req.method === 'OPTIONS') {
    const res = NextResponse.next();
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // Do not enforce outside production when enabled
  const enforceProdOnly = (process.env.TEST_ACCESS_ENFORCE_PROD_ONLY ?? 'true') === 'true';
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const testAccessRequired = process.env.TEST_ACCESS_TOKEN || '';

  // Allowlist helper and health endpoints (enables setting test_access cookie in prod)
  const isHelperRoute =
    pathname.startsWith('/api/test-auth') ||
    pathname.startsWith('/api/echo-ip') ||
    pathname.startsWith('/api/health');

  // Restrict gate scope to admin UI and admin/send APIs only (do not gate public APIs)
  // Exclude the login UI and login API so users can obtain a session
  const isGateTarget =
    (pathname.startsWith('/admin/') ||
      pathname.startsWith('/api/admin/') ||
      pathname.startsWith('/api/send/')) &&
    !isHelperRoute &&
    pathname !== '/admin/login' &&
    pathname !== '/api/admin/login';

  if (enforceProdOnly && isProd && isGateTarget) {
    const headerToken = req.headers.get('x-test-access') || '';
    const cookieToken = req.cookies.get('test_access')?.value || '';
    const token = headerToken || cookieToken;
    if (testAccessRequired && token !== testAccessRequired) {
      return new NextResponse('Forbidden', {
        status: 403,
        headers: { 'x-test-access': 'denied', 'X-Request-Id': requestId },
      });
    }
  }

  const isAdminUI  = pathname.startsWith('/admin/');
  const isAdminAPI = pathname.startsWith('/api/admin/');
  const isSendAPI  = pathname.startsWith('/api/send/');

  // Allow login UI and login API to pass without auth
  if (
    pathname === '/admin/login' ||
    pathname === '/api/admin/login'
  ) {
    const res = NextResponse.next();
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  const isAuthed = req.cookies.get('yff_admin')?.value === '1';

  // Protect Admin UI: redirect to /admin/login when not authed
  if (isAdminUI && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    const res = NextResponse.redirect(url);
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // Protect APIs: return 401 JSON when not authed (no redirects)
  if ((isAdminAPI || isSendAPI) && !isAuthed) {
    return new NextResponse(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized', requestId }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'X-Request-Id': requestId },
    });
  }

  const res = NextResponse.next();
  res.headers.set('X-Request-Id', requestId);
  return res;
}
