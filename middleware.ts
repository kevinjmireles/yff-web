import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/send/:path*'],
};

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const existingReqId = req.headers.get('x-request-id') || req.headers.get('x-correlation-id');
  const requestId = existingReqId || crypto.randomUUID();

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
