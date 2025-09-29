/**
 * Purpose: Centralized JSON response helpers for consistent API shapes
 * and optional requestId propagation in non-production.
 *
 * Called by: API route handlers (admin/send), auth helpers, tests.
 * Exports: jsonOk, jsonError, unauthorized, extractRequestIdFromHeaders, jsonErrorWithId
 */
import { NextResponse } from 'next/server'

/**
 * Returns a standardized success JSON payload.
 * Shape: { ok: true, data }
 */
export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

/**
 * Returns a standardized error JSON payload.
 * Shape: { ok: false, code, message, details? }
 */
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

/** Returns 401 Unauthorized in the standardized error shape. */
export function unauthorized(message = 'Unauthorized') {
  return jsonError('UNAUTHORIZED', message, 401)
}

// Request ID propagation helpers
/** Extracts a request/correlation id from headers if present. */
export function extractRequestIdFromHeaders(headers: Headers): string | undefined {
  return (
    headers.get('x-request-id') ||
    headers.get('x-correlation-id') ||
    undefined
  ) || undefined
}

/**
 * Returns the standardized error shape and includes `requestId` when present
 * on the incoming request headers. Intended for non-production surfaces.
 */
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


