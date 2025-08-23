// Purpose: Simple health check for uptime/smoke tests.
// Called by: Ops checks, E2E tests.

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'yff-web',
    timestamp: new Date().toISOString(),
  })
}
