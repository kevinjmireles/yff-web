# YFF — Decommission Supabase Edge Functions (Migration Pack)

This pack gives you **everything Cursor needs** to remove Supabase Edge Functions and **standardize on Next.js API routes**, per our “Simple Plan.”

> Goal: One deploy surface (Vercel), simpler secrets, easier tests, faster iteration.

---

## 0) Files to Add / Remove (at a glance)

### **Remove** (delete from repo)
```
# adjust paths as needed
supabase/functions/profile-address
supabase/functions/profile-address-v2
supabase/functions/subscriptions-toggle
supabase/functions/unsubscribe
```

### **Add** (new files)
```
src/
  app/
    api/
      profile-address/route.ts
      subscriptions-toggle/route.ts
      unsubscribe/route.ts
  lib/
    supabase/server.ts
    rate-limit.ts
    security/hmac.ts

tests/
  lib/hmac.test.ts
```

### **Modify**
```
.env.example
README.md  (replace “Edge Functions” section with “API Routes” table)
```

---

## 1) Environment Variables

Update **`.env.example`** and your Vercel env.

```diff
- EDGE_SHARED_SECRET=
+ NEXT_PUBLIC_SUPABASE_URL=
+ SUPABASE_SERVICE_ROLE_KEY=
+ GOOGLE_CIVIC_API_KEY=
+ NEXT_PUBLIC_BASE_URL=
+ UNSUBSCRIBE_SIGNING_SECRET=
```

**Notes**
- `SUPABASE_SERVICE_ROLE_KEY` is server-only; never expose on client.
- `NEXT_PUBLIC_BASE_URL` like `https://your-app.vercel.app`.
- `UNSUBSCRIBE_SIGNING_SECRET` any strong random string.

---

## 2) Shared Server Helpers

### `src/lib/supabase/server.ts`
```ts
import { cookies } from 'next/headers'
import { createServerClient as createSSRClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Authenticated client via cookies (RLS enforced, user-context).
 */
export function createServerClient() {
  const cookieStore = cookies()
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options })
        }
      }
    }
  )
}

/**
 * Admin client (service role) for server-to-DB operations (no RLS).
 * Use narrowly and only in route handlers.
 */
export function createServiceRoleClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

> Why both? Simplicity + safety. For user actions, use `createServerClient()` (RLS). For system writes (e.g., unsubscribe link), `createServiceRoleClient()`.

---

### `src/lib/security/hmac.ts`
```ts
import crypto from 'crypto'

export function signHmac(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export function verifyHmac(payload: string, token: string, secret: string) {
  const expected = signHmac(payload, secret)
  // use constant-time comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  } catch {
    return false
  }
}
```

---

### `src/lib/rate-limit.ts` (minimal in-memory limiter)
```ts
// Dev-only in-memory rate limiter. For production, swap to Redis.
const buckets = new Map<string, { count: number; reset: number }>()

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return { allowed: true, remaining: limit - 1, reset: now + windowMs }
  }
  if (b.count < limit) {
    b.count += 1
    return { allowed: true, remaining: limit - b.count, reset: b.reset }
  }
  return { allowed: false, remaining: 0, reset: b.reset }
}
```

> Keep it simple for now. If abuse appears, replace with Upstash/Redis without changing callers.

---

## 3) API Routes (Edge Function replacements)

### A) `/api/profile-address` (replaces `profile-address`)
**Purpose:** Enrich a user’s address using Google Civic API; store `address` and derived `ocd_ids` in `profiles`.

`src/app/api/profile-address/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

const Body = z.object({
  user_id: z.string().uuid(),
  address: z.string().min(5)
})

export async function POST(req: NextRequest) {
  // Basic rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const rl = rateLimit(`profile-address:${ip}`, 10, 60_000) // 10 req/min
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { user_id, address } = parsed.data

  // Call Google Civic API
  const url = new URL('https://www.googleapis.com/civicinfo/v2/representatives')
  url.searchParams.set('key', process.env.GOOGLE_CIVIC_API_KEY!)
  url.searchParams.set('address', address)

  const resp = await fetch(url.toString())
  if (!resp.ok) {
    return NextResponse.json({ error: 'Civic API failed' }, { status: 502 })
  }
  const civic = await resp.json()

  const ocd_ids = extractOcdIds(civic)

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('profiles')
    .update({ address, ocd_ids })
    .eq('user_id', user_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ocd_ids })
}

function extractOcdIds(civic: any): string[] {
  // Reuse/replace with your existing extractor if you have one
  const divisions = civic?.divisions || {}
  return Object.keys(divisions)
}
```

> Auth: If you require only self-updates, add a session check and compare `user.id === user_id`.

---

### B) `/api/subscriptions-toggle` (replaces `subscriptions-toggle`)
**Purpose:** Toggle a user’s subscription to a list/newsletter.

`src/app/api/subscriptions-toggle/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const Body = z.object({
  list_id: z.string(),
  subscribe: z.boolean()
})

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { list_id, subscribe } = parsed.data

  let error
  if (subscribe) {
    ;({ error } = await supabase
      .from('subscriptions')
      .upsert({ user_id: user.id, list_id }, { onConflict: 'user_id,list_id' }))
  } else {
    ;({ error } = await supabase
      .from('subscriptions')
      .delete()
      .match({ user_id: user.id, list_id }))
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

> Simplicity: RLS should enforce that users only touch their own rows. Keep it that way.

---

### C) `/api/unsubscribe` (replaces `unsubscribe`)
**Purpose:** One-click unsubscribe from an email link. No session; HMAC-protected.

`src/app/api/unsubscribe/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyHmac } from '@/lib/security/hmac'

const Q = z.object({
  t: z.string(), // token
  u: z.string().uuid(), // user_id
  l: z.string() // list_id
})

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const parsed = Q.safeParse({
    t: url.searchParams.get('t'),
    u: url.searchParams.get('u'),
    l: url.searchParams.get('l')
  })
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { t, u, l } = parsed.data
  const secret = process.env.UNSUBSCRIBE_SIGNING_SECRET!
  const payload = `${u}|${l}`

  if (!verifyHmac(payload, t, secret)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('subscriptions').delete().match({ user_id: u, list_id: l })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // optional: record in an "unsubscribe_events" table here

  // Redirect to a friendly page
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/unsubscribed`)
}
```

**Helper to build links for emails (use in your send flow/server):**
```ts
import { signHmac } from '@/lib/security/hmac'

export function buildUnsubLink(user_id: string, list_id: string) {
  const payload = `${user_id}|${list_id}`
  const t = signHmac(payload, process.env.UNSUBSCRIBE_SIGNING_SECRET!)
  return `${process.env.NEXT_PUBLIC_BASE_URL}/api/unsubscribe?u=${user_id}&l=${list_id}&t=${t}`
}
```

---

## 4) Tests (high ROI, minimal)

### `tests/lib/hmac.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { signHmac, verifyHmac } from '@/lib/security/hmac'

describe('HMAC utils', () => {
  const secret = 'test_secret_123'
  const payload = 'user|list'

  it('verifies a valid signature', () => {
    const sig = signHmac(payload, secret)
    expect(verifyHmac(payload, sig, secret)).toBe(true)
  })

  it('fails on tampered payload', () => {
    const sig = signHmac(payload, secret)
    expect(verifyHmac(payload + 'x', sig, secret)).toBe(false)
  })

  it('fails on wrong secret', () => {
    const sig = signHmac(payload, secret)
    expect(verifyHmac(payload, sig, 'wrong')).toBe(false)
  })
})
```

> Keep tests lean. Route handlers can be smoke-tested later; HMAC is the critical security primitive.

---

## 5) Frontend wiring quick notes (optional)

- **Preferences UI**: call `POST /api/subscriptions-toggle` with `{ list_id, subscribe }`. Show optimistic UI, rollback on error.
- **Profile form**: call `POST /api/profile-address` with `{ user_id, address }`, then show derived districts. Persist last success in local state.
- **Unsubscribe page**: Just render a confirmation. The API route handles the redirect.

---

## 6) README.md — Replace Edge Functions section

Add this table:

```md
### API Routes (post-Edge migration)

| Flow | URL | Method | Auth | Secret | Notes |
|---|---|---|---|---|---|
| Signup | `/api/signup` | POST | session or captcha | — | Unchanged (direct DB) |
| Address Enrichment | `/api/profile-address` | POST | session/admin | — | Calls Google Civic API; writes to `profiles` |
| Toggle Subscriptions | `/api/subscriptions-toggle` | POST | session | — | RLS should restrict to user rows |
| Unsubscribe (Email) | `/api/unsubscribe` | GET | HMAC link | `UNSUBSCRIBE_SIGNING_SECRET` | No session required |
```

Remove old references to `EDGE_SHARED_SECRET` and Supabase Functions deploy steps.

---

## 7) One-shot Cleanup & Commit Script

Use/adapt these commands in Cursor’s terminal:

```bash
# 1) Remove Supabase Edge Functions
rm -rf supabase/functions/profile-address \
       supabase/functions/profile-address-v2 \
       supabase/functions/subscriptions-toggle \
       supabase/functions/unsubscribe

# 2) Create folders
mkdir -p src/app/api/profile-address \
         src/app/api/subscriptions-toggle \
         src/app/api/unsubscribe \
         src/lib/security \
         src/lib \
         tests/lib

# 3) (Cursor will write the file contents from this doc)

# 4) Env cleanup
sed -i '' "/EDGE_SHARED_SECRET/d" .env.example 2>/dev/null || true
# Ensure required envs exist in .env.example
(grep -q NEXT_PUBLIC_SUPABASE_URL .env.example || echo "NEXT_PUBLIC_SUPABASE_URL=" >> .env.example)
(grep -q SUPABASE_SERVICE_ROLE_KEY .env.example || echo "SUPABASE_SERVICE_ROLE_KEY=" >> .env.example)
(grep -q GOOGLE_CIVIC_API_KEY .env.example || echo "GOOGLE_CIVIC_API_KEY=" >> .env.example)
(grep -q NEXT_PUBLIC_BASE_URL .env.example || echo "NEXT_PUBLIC_BASE_URL=" >> .env.example)
(grep -q UNSUBSCRIBE_SIGNING_SECRET .env.example || echo "UNSUBSCRIBE_SIGNING_SECRET=" >> .env.example)

# 5) Commit
git add -A
git commit -m "chore: decommission Supabase Edge Functions; add Next.js API routes and helpers; remove EDGE_SHARED_SECRET"
```

---

## 8) Smoke Test Checklist

1. **Profile enrichment**
   - `curl -X POST /api/profile-address -d '{"user_id":"<uuid>","address":"2529 N Star 43221"}' -H 'Content-Type: application/json'`
   - Expect `{ ok: true, ocd_ids: [...] }` and row updated in `profiles`.
2. **Toggle subscription**
   - With an authenticated browser session, toggle a list; check `subscriptions` table.
3. **Unsubscribe link**
   - Build link with `buildUnsubLink(user_id, list_id)`; click it; expect redirect to `/unsubscribed` and row removed.
4. **Secrets**
   - Confirm no remaining references to `EDGE_SHARED_SECRET`.

---

## 9) Why this is the simplest maintainable path
- **One stack, one deploy** → less drift and cognitive load.
- **Session or HMAC** instead of custom headers → fewer moving parts.
- **Swappable rate limit** → simple now, scalable later.
- **TDD-light** on the only critical crypto → confidence without over-engineering.

---

## 10) Future niceties (defer until needed)
- Replace in-memory rate limiter with Redis (Upstash).
- Add route smoke tests (using Next’s `Request`/`Response` mocks or integration harness).
- Add an `unsubscribe_events` table for analytics.

---

**Done.** Drop these files into place with Cursor, commit, and you’re off Edge Functions entirely.

