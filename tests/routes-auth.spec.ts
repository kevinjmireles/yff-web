import { describe, it, expect, vi } from 'vitest'
// Keep this spec focused on login handler shape only; send auth is covered in unit tests.
vi.mock('@/lib/env', () => ({ getEnv: () => ({ ADMIN_PASSWORD: 'test' }) }))
import * as loginRoute from '../src/app/api/admin/login/route'

function makeReq(body: unknown = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function read(res: Response) {
  const text = await res.text()
  return { status: res.status, json: JSON.parse(text) }
}

describe('login route', () => {
  it('returns 401 for bad password', async () => {
    const res = await loginRoute.POST(makeReq({ password: 'bad' }) as unknown as Request)
    const out = await read(res as unknown as Response)
    expect(out.status).toBe(401)
    expect(out.json.ok).toBe(false)
  })

  it('returns 200 for good password', async () => {
    const res = await loginRoute.POST(makeReq({ password: 'test' }) as unknown as Request)
    const out = await read(res as unknown as Response)
    expect(out.status).toBe(200)
    expect(out.json.ok).toBe(true)
  })
})
