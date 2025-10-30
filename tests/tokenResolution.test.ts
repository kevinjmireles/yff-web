/**
 * Token Resolution Tests
 *
 * Tests for the resolveTokens function from src/lib/personalize/tokens
 * to ensure it produces valid HTML with representative contact information.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTokens } from '@/lib/personalize/tokens'

// Mock supabaseAdmin
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn()
  }
}))

import { supabaseAdmin } from '@/lib/supabaseAdmin'

describe('Token Resolution', () => {
  const testContext = {
    job_id: 'test-job-id',
    batch_id: 'test-batch-id',
    email: 'test@example.com',
    ocd_ids: ['ocd-division/country:us/state:ca', 'ocd-division/country:us/state:ca/cd:38']
  }

  // Mock officials data
  const mockSenators = [
    {
      official_id: 'senator-1',
      full_name: 'Alex Padilla',
      office_type: 'us_senate',
      state: 'CA',
      district: null,
      official_contacts: [
        { method: 'phone', value: '2022243553', is_active: true },
        { method: 'webform', value: 'https://www.padilla.senate.gov', is_active: true }
      ]
    },
    {
      official_id: 'senator-2',
      full_name: 'Laphonza Butler',
      office_type: 'us_senate',
      state: 'CA',
      district: null,
      official_contacts: [
        { method: 'phone', value: '2022243841', is_active: true },
        { method: 'webform', value: 'https://www.butler.senate.gov', is_active: true }
      ]
    }
  ]

  const mockRep = [
    {
      official_id: 'rep-1',
      full_name: 'Linda Sánchez',
      office_type: 'us_house',
      state: 'CA',
      district: 38,
      official_contacts: [
        { method: 'phone', value: '2022256676', is_active: true },
        { method: 'webform', value: 'https://www.lindasanchez.house.gov', is_active: true }
      ]
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock implementation for database queries
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockReturnThis()
      }

      // Mock senators query
      if (table === 'officials') {
        query.eq = vi.fn().mockImplementation((field: string, value: any) => {
          if (field === 'office_type' && value === 'us_senate') {
            return {
              ...query,
              eq: vi.fn().mockReturnThis(),
              select: query.select,
              then: (resolve: any) => resolve({ data: mockSenators, error: null })
            }
          }
          if (field === 'office_type' && value === 'us_house') {
            return {
              ...query,
              eq: vi.fn().mockReturnThis(),
              select: query.select,
              then: (resolve: any) => resolve({ data: mockRep, error: null })
            }
          }
          return query
        })
      }

      // Mock profile query (for ocd_ids lookup)
      if (table === 'profiles') {
        query.maybeSingle = vi.fn().mockResolvedValue({
          data: { ocd_ids: testContext.ocd_ids },
          error: null
        })
      }

      return query
    })

    vi.mocked(supabaseAdmin.from).mockImplementation(mockFrom)
  })

  describe('[[DELEGATION]] token', () => {
    it('should replace [[DELEGATION]] token with HTML list', async () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Should not contain the token anymore
      expect(resolved).not.toContain('[[DELEGATION]]')

      // Should contain HTML list structure
      expect(resolved).toContain('<ul>')
      expect(resolved).toContain('<li>')
      expect(resolved).toContain('</li>')
      expect(resolved).toContain('</ul>')
    })

    it('should include senator names', async () => {
      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toContain('Senator Alex Padilla')
      expect(resolved).toContain('Senator Laphonza Butler')
    })

    it('should include representative name with district', async () => {
      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toContain('Rep. Linda Sánchez')
      expect(resolved).toContain('(CA-38)')
    })

    it('should include website links', async () => {
      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toContain('https://www.padilla.senate.gov')
      expect(resolved).toContain('https://www.butler.senate.gov')
      expect(resolved).toContain('https://www.lindasanchez.house.gov')
    })

    it('should include phone links with tel: protocol', async () => {
      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toContain('href="tel:2022243553"')
      expect(resolved).toContain('href="tel:2022243841"')
      expect(resolved).toContain('href="tel:2022256676"')
    })

    it('should format phone numbers correctly', async () => {
      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      expect(resolved).toContain('(202) 224-3553')
      expect(resolved).toContain('(202) 224-3841')
      expect(resolved).toContain('(202) 225-6676')
    })

    it('should escape HTML in names', async () => {
      // Test with name containing special characters
      const mockFromWithSpecialChar = vi.fn().mockImplementation((table: string) => {
        if (table === 'officials') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((field: string, value: any) => {
              if (field === 'office_type' && value === 'us_senate') {
                return {
                  select: vi.fn(),
                  eq: vi.fn().mockReturnThis(),
                  then: (resolve: any) => resolve({
                    data: [{
                      ...mockSenators[0],
                      full_name: 'Test <script>alert("xss")</script> Senator'
                    }],
                    error: null
                  })
                }
              }
              return { select: vi.fn(), eq: vi.fn().mockReturnThis(), then: (resolve: any) => resolve({ data: [], error: null }) }
            })
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { ocd_ids: testContext.ocd_ids }, error: null }) }
      })

      vi.mocked(supabaseAdmin.from).mockImplementation(mockFromWithSpecialChar)

      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Should escape < and >
      expect(resolved).not.toContain('<script>')
      expect(resolved).toContain('&lt;script&gt;')
    })

    it('should show fallback when no state found in ocd_ids', async () => {
      const contextWithoutState = {
        ...testContext,
        ocd_ids: ['ocd-division/country:us']
      }

      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, contextWithoutState)

      expect(resolved).toContain('Representative information unavailable')
      expect(resolved).toContain('<em>')
    })

    it('should handle missing ocd_ids by querying profiles table', async () => {
      const contextWithoutOcdIds = {
        job_id: 'test-job-id',
        batch_id: 'test-batch-id',
        email: 'test@example.com'
      }

      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, contextWithoutOcdIds)

      // Should have queried profiles table
      expect(supabaseAdmin.from).toHaveBeenCalledWith('profiles')

      // Should still render delegation
      expect(resolved).toContain('<ul>')
      expect(resolved).toContain('Senator')
    })

    it('should handle only senators (no congressional district)', async () => {
      const contextWithoutDistrict = {
        ...testContext,
        ocd_ids: ['ocd-division/country:us/state:ca'] // No cd: segment
      }

      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, contextWithoutDistrict)

      // Should have 2 senators
      expect(resolved).toContain('Senator Alex Padilla')
      expect(resolved).toContain('Senator Laphonza Butler')

      // Should not have rep (no district to query)
      expect(resolved).not.toContain('Rep.')
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
      expect(resolved).toContain('<ul>')
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
      // Should not call supabaseAdmin if no [[DELEGATION]] token
      expect(supabaseAdmin.from).not.toHaveBeenCalled()
    })

    it('should handle multiple [[DELEGATION]] tokens', async () => {
      const html = '[[DELEGATION]]<p>Middle content</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Should have replaced both tokens
      expect(resolved).not.toContain('[[DELEGATION]]')

      // Should have two <ul> blocks
      const ulCount = (resolved.match(/<ul>/g) || []).length
      expect(ulCount).toBe(2)
    })
  })

  describe('SendGrid compatibility', () => {
    it('should produce valid HTML structure', async () => {
      const html = '<p>Your current congressional delegation:</p>[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Should have valid list structure
      expect(resolved).toMatch(/<ul>.*<\/ul>/)

      // Count opening and closing tags - should match
      const openingUl = (resolved.match(/<ul>/g) || []).length
      const closingUl = (resolved.match(/<\/ul>/g) || []).length
      const openingLi = (resolved.match(/<li>/g) || []).length
      const closingLi = (resolved.match(/<\/li>/g) || []).length

      expect(openingUl).toBe(closingUl)
      expect(openingLi).toBe(closingLi)
      expect(openingLi).toBeGreaterThan(0)
    })

    it('should have properly formatted links', async () => {
      const html = '[[DELEGATION]]'
      const resolved = await resolveTokens(html, testContext)

      // Website links should have proper attributes
      expect(resolved).toMatch(/<a href="https:\/\/[^"]+"\s+target="_blank"\s+rel="noopener noreferrer">/)

      // Phone links should be properly formatted
      expect(resolved).toMatch(/<a href="tel:[0-9]+">/)
    })
  })
})
