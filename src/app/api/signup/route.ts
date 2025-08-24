/**
 * file: app/api/signup/route.ts
 * purpose: Verify reCAPTCHA server-side and (optionally) forward signup to Make webhook.
 * calledBy: app/page.tsx -> SignupForm
 */

import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rateLimiter'

const RECAPTCHA_URL = 'https://www.google.com/recaptcha/api/siteverify'

export async function POST(req: Request) {
  try {
    // Rate limiting - 5 requests per minute per IP
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(clientIP, 5, 60000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    const { name, email, address, recaptchaToken } = await req.json()

    if (!email || !address) {
      return NextResponse.json({ success: false, error: 'Email and address are required' }, { status: 400 })
    }

    // reCAPTCHA is optional in dev — only enforce if secret is present
    const secret = process.env.RECAPTCHA_SECRET_KEY
    if (secret) {
      if (!recaptchaToken) {
        return NextResponse.json({ success: false, error: 'Missing reCAPTCHA token' }, { status: 400 })
      }
      const recaptchaRes = await fetch(RECAPTCHA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(recaptchaToken)}`
      }).then(r => r.json())

      if (!recaptchaRes?.success) {
        return NextResponse.json({ success: false, error: 'reCAPTCHA verification failed' }, { status: 400 })
      }
    }

    // Optional: forward to Make webhook
    const webhook = process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL
    if (webhook) {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, address }),
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Thanks for signing up—watch your inbox!',
      data: { districtsFound: 0, subscriberId: 'pending-via-make' }
    })
  } catch (error) {
    console.error('Signup API failed', error)
    return NextResponse.json({ success: false, error: 'Signup failed. Please try again.' }, { status: 500 })
  }
}
