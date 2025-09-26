import { NextRequest, NextResponse } from 'next/server';

export function GET(req: NextRequest) {
  const ip = (req as any).ip ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  return NextResponse.json({ ip });
}


