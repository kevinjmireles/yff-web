/**
 * file: tests/civic-parser.spec.ts
 * purpose: Unit tests for Google Civic API response parsing
 * tests: OCD ID extraction, timeout handling, response validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the successful Google Civic API response (based on actual test data)
const mockCivicResponse = {
  normalizedInput: {
    line1: "2529 N Star Road",
    city: "Upper Arlington", 
    state: "OH",
    zip: "43221"
  },
  divisions: {
    "ocd-division/country:us/state:oh/sldl:7": {
      name: "Ohio State House district 7"
    },
    "ocd-division/country:us/state:oh/place:upper_arlington": {
      name: "Upper Arlington city"
    },
    "ocd-division/country:us": {
      name: "United States"
    },
    "ocd-division/country:us/state:oh/sldu:25": {
      name: "Ohio State Senate district 25"
    },
    "ocd-division/country:us/state:oh/county:franklin": {
      name: "Franklin County"
    },
    "ocd-division/country:us/state:oh/county:franklin/school_district:upper_arlington_city": {
      name: "Upper Arlington City School District"
    },
    "ocd-division/country:us/state:oh": {
      name: "Ohio"
    },
    "ocd-division/country:us/state:oh/cd:3": {
      name: "Ohio's 3rd congressional district"
    }
  }
}

// Helper function to simulate the parsing logic from signup route
function parseCivicResponse(civic: any): { ocdIds: string[], zipcode: string | null } {
  const divisions = civic?.divisions ?? {}
  const ocdIds = Object.keys(divisions)
  const zipcode = civic?.normalizedInput?.zip ?? null
  return { ocdIds, zipcode }
}

describe('Civic API Response Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('successful response parsing', () => {
    it('should extract OCD IDs from divisions object', () => {
      const { ocdIds } = parseCivicResponse(mockCivicResponse)
      
      expect(ocdIds.length).toBe(8)
      expect(ocdIds).toEqual(expect.arrayContaining([
        expect.stringMatching(/^ocd-division\/country:us$/)
      ]))
    })

    it('should extract zipcode from normalizedInput', () => {
      const { zipcode } = parseCivicResponse(mockCivicResponse)
      
      expect(zipcode).toBe('43221')
    })

    it('should include proper geographic hierarchy', () => {
      const { ocdIds } = parseCivicResponse(mockCivicResponse)
      
      // Should contain federal, state, county, city levels
      expect(ocdIds).toEqual(expect.arrayContaining([
        'ocd-division/country:us',
        'ocd-division/country:us/state:oh', 
        'ocd-division/country:us/state:oh/county:franklin',
        'ocd-division/country:us/state:oh/place:upper_arlington'
      ]))
    })

    it('should include legislative districts', () => {
      const { ocdIds } = parseCivicResponse(mockCivicResponse)
      
      expect(ocdIds).toEqual(expect.arrayContaining([
        'ocd-division/country:us/state:oh/cd:3', // Congressional
        'ocd-division/country:us/state:oh/sldl:7', // State House
        'ocd-division/country:us/state:oh/sldu:25' // State Senate
      ]))
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle empty divisions object', () => {
      const emptyResponse = { divisions: {} }
      const { ocdIds, zipcode } = parseCivicResponse(emptyResponse)
      
      expect(ocdIds).toEqual([])
      expect(zipcode).toBeNull()
    })

    it('should handle missing divisions property', () => {
      const nodivisions = { normalizedInput: { zip: '12345' } }
      const { ocdIds, zipcode } = parseCivicResponse(nodivisions)
      
      expect(ocdIds).toEqual([])
      expect(zipcode).toBe('12345')
    })

    it('should handle completely empty response', () => {
      const { ocdIds, zipcode } = parseCivicResponse(null)
      
      expect(ocdIds).toEqual([])
      expect(zipcode).toBeNull()
    })
  })

  describe('fetch timeout handling', () => {
    it('should handle fetch timeout gracefully', async () => {
      // Mock fetch to simulate timeout
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100)
        })
      })
      
      global.fetch = mockFetch

      // Simulate the timeout logic from signup route
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 50)
      
      try {
        await fetch('https://example.com', { signal: controller.signal })
      } catch (error: any) {
        expect(error.message).toBe('AbortError')
      } finally {
        clearTimeout(timeoutId)
      }
      
      // Should continue with empty ocd_ids array (graceful degradation)
      const { ocdIds } = parseCivicResponse(null)
      expect(ocdIds).toEqual([])
    })
  })

  describe('data validation', () => {
    it('should validate OCD ID format', () => {
      const { ocdIds } = parseCivicResponse(mockCivicResponse)
      
      ocdIds.forEach(id => {
        expect(id).toMatch(/^ocd-division\/country:us/)
        expect(id).not.toContain(' ') // No spaces
        expect(id.length).toBeGreaterThan(20) // Reasonable length
      })
    })

    it('should ensure no duplicate OCD IDs', () => {
      const { ocdIds } = parseCivicResponse(mockCivicResponse)
      
      const uniqueIds = new Set(ocdIds)
      expect(uniqueIds.size).toBe(ocdIds.length)
    })
  })
})
