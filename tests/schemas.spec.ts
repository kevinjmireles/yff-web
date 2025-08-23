// Purpose: Happy-path tests for Zod schemas.

import { describe, it, expect } from 'vitest'
import { signupSchema, adminTriggerSchema } from '../src/lib/schema'

describe('schemas', () => {
  it('parses a valid signup payload', () => {
    const validSignup = {
      email: 'test@example.com',
      zipcode: '12345',
    }
    const result = signupSchema.safeParse(validSignup)
    expect(result.success).toBe(true)
  })

  it('parses a valid admin trigger payload', () => {
    const validTrigger = {
      campaign_tag: 'test-campaign',
      subject: 'Hello World',
      body_template_id: 'd-12345',
      test_recipients: ['test@example.com', 'another@example.com'],
    }
    const result = adminTriggerSchema.safeParse(validTrigger)
    expect(result.success).toBe(true)
    // Check optional field not present
    expect(result.success && 'audience_filter' in result.data).toBe(false)
  })
})
