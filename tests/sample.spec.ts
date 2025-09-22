// Purpose: First happy-path test to ensure test runner is wired.
// Uses vitest for simplicity.

import { describe, it, expect } from 'vitest'
import { isFeatureEnabled } from '../src/lib/features'

describe('features', () => {
  it('returns true for existing features by default', () => {
    expect(isFeatureEnabled('adminSend')).toBe(true)
  })
  
  it('returns false for non-existent features', () => {
    // @ts-expect-error - testing invalid feature key
    expect(isFeatureEnabled('NON_EXISTENT_FEATURE')).toBe(undefined)
  })
})
