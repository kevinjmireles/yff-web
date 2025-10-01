// file: src/app/api/test-auth/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function bad(method: string) {
  return NextResponse.json({ ok: false, error: `Use GET, not ${method}` }, { status: 405 })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const param = url.searchParams.get('token') ?? url.searchParams.get('t')
  const expected = process.env.TEST_ACCESS_TOKEN ?? ''
  const secure = process.env.NODE_ENV === 'production'
  const headers = { 'Cache-Control': 'no-store' }

  // If TEST_ACCESS_TOKEN is not set, feature is effectively disabled but succeed clearly
  if (!expected) {
    return NextResponse.json(
      { ok: true, message: 'test access token not configured' },
      { status: 200, headers }
    )
  }

  // No token provided -> clear cookie (consistent attrs to ensure deletion)
  if (!param) {
    const res = NextResponse.json(
      { ok: true, message: 'cookie cleared' },
      { status: 200, headers }
    )
    res.cookies.set('test_access', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 0,
    })
    return res
  }

  // Mismatch
  if (param !== expected) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_TOKEN' },
      { status: 403, headers }
    )
  }

  // Match -> set cookie to the TOKEN itself (so middleware check passes)
  const res = NextResponse.json(
    { ok: true, message: 'cookie set' },
    { status: 200, headers }
  )
  res.cookies.set('test_access', param, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 86400, // 1 day
  })
  return res
}

export function POST()   { return bad('POST') }
export function PUT()    { return bad('PUT') }
export function PATCH()  { return bad('PATCH') }
export function DELETE() { return bad('DELETE') }
