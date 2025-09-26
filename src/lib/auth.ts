// Purpose: Minimal admin cookie gate helpers for API and middleware.
// Called by: /app/admin/* routes, server components, middleware, APIs.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function isAdminCookiePresent(req: NextRequest): boolean {
  // Admin login sets yff_admin=1; secure, httpOnly, lax
  return req.cookies.get('yff_admin')?.value === '1'
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (isAdminCookiePresent(req)) return null
  return new NextResponse(
    JSON.stringify({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' }),
    { status: 401, headers: { 'content-type': 'application/json' } }
  )
}
