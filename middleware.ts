import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/send/:path*'],
};

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminUI  = pathname.startsWith('/admin/');
  const isAdminAPI = pathname.startsWith('/api/admin/');
  const isSendAPI  = pathname.startsWith('/api/send/');

  // Allow login UI and login API to pass without auth
  if (
    pathname === '/admin/login' ||
    pathname === '/api/admin/login'
  ) {
    return NextResponse.next();
  }

  const isAuthed = req.cookies.get('yff_admin')?.value === '1';

  // Protect Admin UI: redirect to /admin/login when not authed
  if (isAdminUI && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Protect APIs: return 401 JSON when not authed (no redirects)
  if ((isAdminAPI || isSendAPI) && !isAuthed) {
    return new NextResponse(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  return NextResponse.next();
}
