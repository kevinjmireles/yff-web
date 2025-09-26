import { describe, it, expect } from 'vitest'
import { requireAdmin } from '../src/lib/auth'

function makeReq(cookieValue?: string) {
  // Minimal stub to match the shape used by requireAdmin/isAdminCookiePresent
  return {
    cookies: {
      get: (name: string) => {
        if (name !== 'yff_admin') return undefined
        return cookieValue ? { name, value: cookieValue } : undefined
      },
    },
  } as unknown as import('next/server').NextRequest
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  return JSON.parse(text)
}

describe('requireAdmin', () => {
  it('returns 401 when cookie missing', async () => {
    const res = requireAdmin(makeReq())
    expect(res?.status).toBe(401)
    const body = await readJson<{ ok: boolean; code: string }>(res as unknown as Response)
    expect(body.ok).toBe(false)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('passes when yff_admin=1', () => {
    const res = requireAdmin(makeReq('1'))
    expect(res).toBeNull()
  })
})


