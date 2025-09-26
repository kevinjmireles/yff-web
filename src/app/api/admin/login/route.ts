import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { jsonErrorWithId } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const ok = password === getEnv().ADMIN_PASSWORD;
  if (!ok) {
    const res = jsonErrorWithId(req, 'INVALID_PASSWORD', 'Invalid password', 401);
    res.headers.set('X-Login-Handler', 'api-admin-login:invalid');
    return res;
  }
  const res = NextResponse.json({ ok: true, message: 'Login successful' }, { status: 200 });
  res.cookies.set('yff_admin', '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 8, // 8h
  });
  res.headers.set('X-Login-Handler', 'api-admin-login:success');
  return res;
}

export async function GET() {
  const res = NextResponse.json(
    { ok: false, code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
  res.headers.set('X-Login-Handler', 'api-admin-login:get-blocked');
  return res;
}