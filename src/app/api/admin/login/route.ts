import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  const { password } = await req.json();
  const ok = password === process.env.ADMIN_PASSWORD; // TODO: replace with real check
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, message: 'Login successful' }, { status: 200 });
  res.cookies.set('yff_admin', '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 8, // 8h
  });
  return res;
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}