/**
 * Token Resolution Tests
 *
 * Tests for the resolveTokens function from src/lib/personalize/tokens
 * to ensure it produces valid HTML without orphaned text nodes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTokens } from '@/lib/personalize/tokens'

// Mock the delegation links module
vi.mock('@/lib/delegation/links', () => ({
  latestDelegationUrl: vi.fn()
}))

import { latestDelegationUrl } from '@/lib/delegation/links'

// Set env vars for getBaseUrl fallback
process.env.BASE_URL = 'http://localhost:3000'

describe('Token Resolution', () => {
  const testContext = {
    job_id: 'test-job-id',
    batch_id: 'test-batch-id',
    email: 'test@example.com'
  }

  const mockDelegationUrl = 'http://localhost:3000/delegate?job_id=test-job-id&batch_id=test-batch-id&email=test%40example.com'

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return a delegation URL
    vi.mocked(latestDelegationUrl).mockResolvedValue(mockDelegationUrl)
  })

  describe('[[DELEGATION]] token', () => {
    it('should replace [[DELEGATION]] token with wrapped HTML', async () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Should not contain the token anymore
      expect(resolved).not.toContain('[[DELEGATION]]')

      // Should contain the delegation link
      expect(resolved).toContain('delegate this action')
      expect(resolved).toContain('/delegate?')

      // Should have called latestDelegationUrl with email and job_id
      expect(latestDelegationUrl).toHaveBeenCalledWith(testContext.email, testContext.job_id)
    })

    it('should not produce orphaned text nodes', async () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Check that there's no text directly between closing and opening tags
      // Pattern: </tag>text<tag> where text has no tags
      const orphanedTextPattern = /<\/[^>]+>\s*([^<\s][^<]*[^>\s])\s*<[^>]+>/
      const match = resolved.match(orphanedTextPattern)

      expect(match).toBeNull()
    })

    it('should wrap delegation content in <p> tag', async () => {
      const html = '<p>Content before</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Should have two sequential <p> tags
      expect(resolved).toMatch(/<p>Content before<\/p><p>If you can't email/)
    })

    it('should produce valid HTML structure', async () => {
      const html = '<p>Paragraph 1</p><p>Your delegation:</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Count opening and closing p tags - should match
      const openingTags = (resolved.match(/<p>/g) || []).length
      const closingTags = (resolved.match(/<\/p>/g) || []).length

      expect(openingTags).toBe(closingTags)
      expect(openingTags).toBeGreaterThan(0)
    })

    it('should include URL from database', async () => {
      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toContain(mockDelegationUrl)
      expect(resolved).toContain(`job_id=${testContext.job_id}`)
      expect(resolved).toContain(`batch_id=${testContext.batch_id}`)
      expect(resolved).toContain(`email=${encodeURIComponent(testContext.email)}`)
    })

    it('should show fallback when delegation URL is unavailable', async () => {
      vi.mocked(latestDelegationUrl).mockResolvedValue(null)

      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toContain('delegation link unavailable')
      expect(resolved).toContain('<em>')
    })
  })

  describe('Other tokens', () => {
    it('should replace [[EMAIL]] token', async () => {
      const html = '<p>Email: [[EMAIL]]</p>'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[EMAIL]]')
      expect(resolved).toContain(testContext.email)
    })

    it('should replace [[JOB_ID]] token', async () => {
      const html = '<p>Job: [[JOB_ID]]</p>'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[JOB_ID]]')
      expect(resolved).toContain(testContext.job_id)
    })

    it('should replace [[BATCH_ID]] token', async () => {
      const html = '<p>Batch: [[BATCH_ID]]</p>'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[BATCH_ID]]')
      expect(resolved).toContain(testContext.batch_id)
    })

    it('should replace multiple tokens in one string', async () => {
      const html = '<p>Email: [[EMAIL]], Job: [[JOB_ID]]</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[EMAIL]]')
      expect(resolved).not.toContain('[[JOB_ID]]')
      expect(resolved).not.toContain('[[DELEGATION]]')

      expect(resolved).toContain(testContext.email)
      expect(resolved).toContain(testContext.job_id)
      expect(resolved).toContain('delegate this action')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty HTML', async () => {
      const html = ''
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toBe('')
    })

    it('should handle HTML with no tokens', async () => {
      const html = '<p>Just regular HTML</p>'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toBe(html)
      // Should not call latestDelegationUrl if no [[DELEGATION]] token
      expect(latestDelegationUrl).not.toHaveBeenCalled()
    })

    it('should handle multiple [[DELEGATION]] tokens', async () => {
      const html = '[[DELEGATION]]<p>Middle content</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Should have replaced both tokens
      expect(resolved).not.toContain('[[DELEGATION]]')

      // Should have two delegation links
      const delegationCount = (resolved.match(/delegate this action/g) || []).length
      expect(delegationCount).toBe(2)
    })
  })

  describe('SendGrid compatibility', () => {
    it('should produce HTML that SendGrid will accept', async () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // All these checks ensure SendGrid won't reject with 400
      // 1. No orphaned text
      const hasOrphanedText = /<\/[^>]+>\s*[^<\s][^<]*[^>\s]\s*<[^>]+>/.test(resolved)
      expect(hasOrphanedText).toBe(false)

      // 2. All content is wrapped in tags
      const textOutsideTags = /^[^<]|[^>]$/
      expect(resolved).not.toMatch(textOutsideTags)

      // 3. Has valid structure
      expect(resolved).toMatch(/<p>.*<\/p>/)
    })
  })
})
