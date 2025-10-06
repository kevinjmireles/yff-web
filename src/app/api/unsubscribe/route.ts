// Purpose: API-only unsubscribe endpoint with HMAC validation
// Called by: Email unsubscribe links
// Security: Validates HMAC token, updates unsubscribes table directly

import { NextRequest } from 'next/server'
import { verify } from '@/lib/unsubscribe'

export const runtime = 'nodejs'

function html(body: string, status = 200) {
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>body{font-family:system-ui;margin:40px;line-height:1.6} .card{max-width:560px} a{color:inherit}</style>
  <div class="card">${body}</div>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email') || ''
  const list = url.searchParams.get('list') || 'general'
  const token = url.searchParams.get('token') || ''

  if (!email || !token) return html(`<h1>Unsubscribe</h1><p>Missing parameters.</p>`, 400)
  if (!verify(email, list, token)) return html(`<h1>Unsubscribe</h1><p>Invalid or expired link.</p>`, 400)

  try {
    const ua = req.headers.get('user-agent') || null
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/unsubscribes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ email, list_key: list, user_agent: ua, ip })
    })
    if (!res.ok) return html(`<h1>Unsubscribe</h1><p>We couldn't process your request at this time.</p>`, 500)
  } catch {
    return html(`<h1>Unsubscribe</h1><p>Server error.</p>`, 500)
  }

  return html(`<h1>You're unsubscribed</h1><p>${email} will no longer receive emails from this list.</p><p><a href="/">Return home</a></p>`)
}
