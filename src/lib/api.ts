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


