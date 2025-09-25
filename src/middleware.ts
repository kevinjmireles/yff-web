/**
 * Next.js Middleware
 * 
 * Purpose: Protect admin routes and add security headers
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/features';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminUI = pathname.startsWith('/admin/');
  const isAdminAPI = pathname.startsWith('/api/admin/');
  const isSendAPI = pathname.startsWith('/api/send/');

  // Skip middleware for the admin login API to allow logging in
  if (isAdminAPI && pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  // Exclude Next assets and common static files (defensive – though not matched above)
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/robots.txt') ||
    pathname.startsWith('/sitemap.xml')
  ) {
    return NextResponse.next();
  }

  // Auth check using your cookie
  const isAuthed = request.cookies.get('yff_admin')?.value === '1';

  // Protect Admin UI: redirect to /admin/login when not authed
  if (isAdminUI && !isAuthed && pathname !== '/admin/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Protect Admin/Send APIs: return JSON 401 (no redirect) when not authed
  if ((isAdminAPI || isSendAPI) && !isAuthed) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  // Add security headers
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  return response;
}

export const config = {
  matcher: [
    // Admin UI
    '/admin/:path*',
    // Protected APIs (keep in middleware): admin & send
    '/api/admin/:path*',
    '/api/send/:path*',
    // Exclusions are handled via conditional checks below; we do not include global catch-alls here.
  ],
};
