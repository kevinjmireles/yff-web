import { describe, it, expect } from 'vitest'
import { jsonOk, jsonError, unauthorized } from '../src/lib/api'

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  return JSON.parse(text)
}

describe('api helpers', () => {
  it('jsonOk wraps data with ok: true', async () => {
    const res = jsonOk({ hello: 'world' })
    expect(res.status).toBe(200)
    const body = await readJson<{ ok: boolean; data: { hello: string } }>(res as unknown as Response)
    expect(body.ok).toBe(true)
    expect(body.data.hello).toBe('world')
  })

  it('jsonError returns consistent error shape', async () => {
    const res = jsonError('TEST', 'Failed', 422, { info: 1 })
    expect(res.status).toBe(422)
    const body = await readJson<{ ok: boolean; code: string; message: string; details: unknown }>(res as unknown as Response)
    expect(body.ok).toBe(false)
    expect(body.code).toBe('TEST')
    expect(body.message).toBe('Failed')
    expect(body.details).toBeDefined()
  })

  it('unauthorized returns 401 with code/message', async () => {
    const res = unauthorized()
    expect(res.status).toBe(401)
    const body = await readJson<{ ok: boolean; code: string; message: string }>(res as unknown as Response)
    expect(body.ok).toBe(false)
    expect(body.code).toBe('UNAUTHORIZED')
    expect(body.message).toBeTruthy()
  })
})


