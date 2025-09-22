/**
 * Next.js Middleware
 * 
 * Purpose: Protect admin routes and add security headers
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/features';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    // Check if admin authentication is enabled
    if (isFeatureEnabled('adminAuth')) {
      const adminCookie = request.cookies.get('yff_admin');
      if (adminCookie?.value !== '1') {
        // Redirect to login
        return NextResponse.redirect(new URL('/admin/login', request.url));
      }
    }
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
    '/admin/:path*',
    '/api/send/:path*',
    '/api/admin/:path*'
  ]
};
