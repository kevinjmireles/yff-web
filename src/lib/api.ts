/**
 * Minimal JSON response helpers for consistent shapes.
 */
import { NextResponse } from 'next/server'

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function jsonError(
  code: string,
  message: string,
  status = 400,
  details?: unknown
) {
  const body: Record<string, unknown> = { ok: false, code, message }
  if (details !== undefined) body.details = details
  return NextResponse.json(body, { status })
}

export function unauthorized(message = 'Unauthorized') {
  return jsonError('UNAUTHORIZED', message, 401)
}

// Request ID propagation helpers
export function extractRequestIdFromHeaders(headers: Headers): string | undefined {
  return (
    headers.get('x-request-id') ||
    headers.get('x-correlation-id') ||
    undefined
  ) || undefined
}

export function jsonErrorWithId(
  req: Request,
  code: string,
  message: string,
  status = 400,
  details?: unknown
) {
  const requestId = extractRequestIdFromHeaders(new Headers(req.headers))
  const body: Record<string, unknown> = { ok: false, code, message }
  if (details !== undefined) body.details = details
  if (requestId) body.requestId = requestId
  return NextResponse.json(body, { status })
}


