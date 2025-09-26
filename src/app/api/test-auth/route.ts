import { NextRequest, NextResponse } from 'next/server';

export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const t = url.searchParams.get('token') || '';
  const required = process.env.TEST_ACCESS_TOKEN || '';

  if (!required || t !== required) {
    return new NextResponse('Invalid token', { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('test_access', t, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60,
  });
  return res;
}
