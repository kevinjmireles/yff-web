import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const Body = z.object({
  job_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  results: z.array(z.object({
    email: z.string().email(),
    status: z.enum(['delivered','failed']),
    provider_message_id: z.string().optional(),
    error: z.string().nullish()
  }))
})

describe('provider callback schema', () => {
  it('accepts valid payload', () => {
    const ok = Body.safeParse({
      job_id: '00000000-0000-0000-0000-000000000001',
      batch_id: '00000000-0000-0000-0000-000000000002',
      results: [ { email: 'a@b.com', status: 'delivered', provider_message_id: 'SG-1', error: null } ]
    })
    expect(ok.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const bad = Body.safeParse({
      job_id: '00000000-0000-0000-0000-000000000001',
      batch_id: '00000000-0000-0000-0000-000000000002',
      results: [ { email: 'a@b.com', status: 'unknown' } ]
    })
    expect(bad.success).toBe(false)
  })
})
