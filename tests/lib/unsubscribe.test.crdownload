import { describe, it, expect, beforeAll } from 'vitest'

let sign: (email: string, listKey: string) => string
let verify: (email: string, listKey: string, token: string) => boolean
let generateUnsubscribeUrl: (email: string, listKey?: string) => string

beforeAll(async () => {
  process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
  process.env.UNSUBSCRIBE_SIGNING_SECRET = 'test-secret'
  const mod = await import('../../src/lib/unsubscribe')
  sign = mod.sign
  verify = mod.verify
  generateUnsubscribeUrl = mod.generateUnsubscribeUrl
})

describe('unsubscribe HMAC helper', () => {
  it('generates a stable token and verifies it', () => {
    process.env.BASE_URL = 'http://localhost:3000'
    const token = sign('user@example.com', 'general')
    expect(verify('user@example.com', 'general', token)).toBe(true)
    expect(verify('user@example.com', 'other', token)).toBe(false)
  })

  it('builds a valid URL', () => {
    process.env.BASE_URL = 'http://localhost:3000'
    const url = generateUnsubscribeUrl('user@example.com', 'general')
    expect(url).toContain('/api/unsubscribe?')
    expect(url).toContain('email=user%40example.com')
    expect(url).toContain('list=general')
    expect(url).toContain('token=')
  })
})
