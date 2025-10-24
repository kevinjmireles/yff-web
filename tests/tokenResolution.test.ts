/**
 * Token Resolution Tests
 *
 * Tests for the resolveTokens function in the personalize API
 * to ensure it produces valid HTML without orphaned text nodes.
 */

import { describe, it, expect } from 'vitest'

// Helper to simulate the resolveTokens function
// This is duplicated here for testing - in production it lives in the API route
const BASE_URL = 'http://localhost:3000'

function buildDelegationHTML(opts: { job_id: string; batch_id: string; email: string }) {
  const u = new URL('/delegate', BASE_URL)
  u.searchParams.set('job_id', opts.job_id)
  u.searchParams.set('batch_id', opts.batch_id)
  u.searchParams.set('email', opts.email)
  return `<p>If you can't email right now, you can <a href="${u.toString()}" target="_blank" rel="noopener noreferrer">delegate this action</a>.</p>`
}

function resolveTokens(html: string, ctx: { job_id: string; batch_id: string; email: string }) {
  let out = html ?? ''
  out = out.replace(/\[\[DELEGATION\]\]/g, buildDelegationHTML(ctx))
  out = out.replace(/\[\[EMAIL\]\]/g, ctx.email)
  out = out.replace(/\[\[JOB_ID\]\]/g, ctx.job_id)
  out = out.replace(/\[\[BATCH_ID\]\]/g, ctx.batch_id)
  return out
}

describe('Token Resolution', () => {
  const testContext = {
    job_id: 'test-job-id',
    batch_id: 'test-batch-id',
    email: 'test@example.com'
  }

  describe('[[DELEGATION]] token', () => {
    it('should replace [[DELEGATION]] token with wrapped HTML', () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

      // Should not contain the token anymore
      expect(resolved).not.toContain('[[DELEGATION]]')

      // Should contain the delegation link
      expect(resolved).toContain('delegate this action')
      expect(resolved).toContain('/delegate?')
    })

    it('should not produce orphaned text nodes', () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

      // Check that there's no text directly between closing and opening tags
      // Pattern: </tag>text<tag> where text has no tags
      const orphanedTextPattern = /<\/[^>]+>\s*([^<\s][^<]*[^>\s])\s*<[^>]+>/
      const match = resolved.match(orphanedTextPattern)

      expect(match).toBeNull()
    })

    it('should wrap delegation content in <p> tag', () => {
      const html = '<p>Content before</p>[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

      // Should have two sequential <p> tags
      expect(resolved).toMatch(/<p>Content before<\/p><p>If you can't email/)
    })

    it('should produce valid HTML structure', () => {
      const html = '<p>Paragraph 1</p><p>Your delegation:</p>[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

      // Count opening and closing p tags - should match
      const openingTags = (resolved.match(/<p>/g) || []).length
      const closingTags = (resolved.match(/<\/p>/g) || []).length

      expect(openingTags).toBe(closingTags)
      expect(openingTags).toBeGreaterThan(0)
    })

    it('should include all required URL parameters', () => {
      const html = '[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

      expect(resolved).toContain(`job_id=${testContext.job_id}`)
      expect(resolved).toContain(`batch_id=${testContext.batch_id}`)
      expect(resolved).toContain(`email=${encodeURIComponent(testContext.email)}`)
    })
  })

  describe('Other tokens', () => {
    it('should replace [[EMAIL]] token', () => {
      const html = '<p>Email: [[EMAIL]]</p>'
      const resolved = resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[EMAIL]]')
      expect(resolved).toContain(testContext.email)
    })

    it('should replace [[JOB_ID]] token', () => {
      const html = '<p>Job: [[JOB_ID]]</p>'
      const resolved = resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[JOB_ID]]')
      expect(resolved).toContain(testContext.job_id)
    })

    it('should replace [[BATCH_ID]] token', () => {
      const html = '<p>Batch: [[BATCH_ID]]</p>'
      const resolved = resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[BATCH_ID]]')
      expect(resolved).toContain(testContext.batch_id)
    })

    it('should replace multiple tokens in one string', () => {
      const html = '<p>Email: [[EMAIL]], Job: [[JOB_ID]]</p>[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

      expect(resolved).not.toContain('[[EMAIL]]')
      expect(resolved).not.toContain('[[JOB_ID]]')
      expect(resolved).not.toContain('[[DELEGATION]]')

      expect(resolved).toContain(testContext.email)
      expect(resolved).toContain(testContext.job_id)
      expect(resolved).toContain('delegate this action')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty HTML', () => {
      const html = ''
      const resolved = resolveTokens(html, testContext)

      expect(resolved).toBe('')
    })

    it('should handle HTML with no tokens', () => {
      const html = '<p>Just regular HTML</p>'
      const resolved = resolveTokens(html, testContext)

      expect(resolved).toBe(html)
    })

    it('should handle multiple [[DELEGATION]] tokens', () => {
      const html = '[[DELEGATION]]<p>Middle content</p>[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

      // Should have replaced both tokens
      expect(resolved).not.toContain('[[DELEGATION]]')

      // Should have two delegation links
      const delegationCount = (resolved.match(/delegate this action/g) || []).length
      expect(delegationCount).toBe(2)
    })
  })

  describe('SendGrid compatibility', () => {
    it('should produce HTML that SendGrid will accept', () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = resolveTokens(html, testContext)

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
