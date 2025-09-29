/**
 * Purpose: Minimal admin cookie gate helpers used by APIs and middleware.
 *
 * Called by: `/app/admin/*` routes, server components, middleware, APIs.
 * Exports: isAdminCookiePresent, requireAdmin
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { unauthorized } from './api'

export function isAdminCookiePresent(req: NextRequest): boolean {
  // Admin login sets yff_admin=1; secure, httpOnly, lax
  return req.cookies.get('yff_admin')?.value === '1'
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (isAdminCookiePresent(req)) return null
  return unauthorized()
}
