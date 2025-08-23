// Purpose: First happy-path test to ensure test runner is wired.
// Uses vitest for simplicity.

import { describe, it, expect } from 'vitest'
import { isFeatureEnabled } from '../src/lib/features'

describe('features', () => {
  it('returns false when flag not set', () => {
    expect(isFeatureEnabled('FEATURE_DELEGATION_TOKENS')).toBe(false)
  })
})
