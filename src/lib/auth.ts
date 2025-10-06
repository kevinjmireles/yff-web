/**
 * Purpose: Minimal admin cookie gate helpers used by APIs and middleware.
 *
 * Called by: `/app/admin/*` routes, server components, middleware, APIs.
 * Exports: isAdminCookiePresent, requireAdmin
 */

import type { NextRequest } from 'next/server'
import { jsonErrorWithId } from './api'

export function isAdminCookiePresent(req: NextRequest): boolean {
  // Admin login sets yff_admin=1; secure, httpOnly, lax
  return req.cookies.get('yff_admin')?.value === '1'
}

export function requireAdmin(req: NextRequest) {
  // Safe header accessor for tests/mocks lacking a real Headers instance
  const getHeader = (key: string): string | null => {
    try {
      // @ts-expect-error tolerate non-standard request stubs in tests
      const h = req?.headers as Headers | { get?: (k: string) => string | null } | undefined
      if (!h || typeof h.get !== 'function') return null
      return h.get(key)
    } catch {
      return null
    }
  }

  const authHeader = getHeader('authorization') || getHeader('Authorization') || undefined
  const xAdmin = getHeader('x-admin-token') || getHeader('X-Admin-Token') || undefined
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '') : undefined

  const envToken = process.env.ADMIN_API_TOKEN || ''
  // Header-based admin (preferred for CI/bots) — only enforced when configured
  if (envToken && ((bearer && bearer === envToken) || (xAdmin && xAdmin === envToken))) {
    return null
  }

  // Cookie-based admin (legacy/current behavior)
  const cookieOk =
    req.cookies.get('yff_admin')?.value === '1' ||
    req.cookies.get('admin_session')?.value === '1'

  if (cookieOk) return null

  // Deny
  return jsonErrorWithId(req, 'UNAUTHORIZED', 'Admin credentials required', 401)
}
