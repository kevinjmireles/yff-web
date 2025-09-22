import { describe, it, expect, vi } from 'vitest';
import { 
  parseAudienceRule, 
  buildSupabaseFilters, 
  executeAudienceRule,
  validateAudienceRule,
  type ParsedRule,
  type Clause 
} from '../src/lib/audienceRule';

describe('Audience Rule Parser', () => {
  describe('parseAudienceRule', () => {
    it('should parse simple equality rules', () => {
      const result = parseAudienceRule("state == 'OH'");
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0]).toEqual({
        field: 'state',
        op: 'eq',
        value: 'OH'
      });
    });

    it('should parse array membership rules', () => {
      const result = parseAudienceRule("county_fips in ['39049','39041']");
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0]).toEqual({
        field: 'county_fips',
        op: 'in',
        values: ['39049', '39041']
      });
    });

    it('should parse OR combinations', () => {
      const result = parseAudienceRule("state == 'OH' or county_fips in ['39049']");
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses[0]).toEqual({
        field: 'state',
        op: 'eq',
        value: 'OH'
      });
      expect(result.clauses[1]).toEqual({
        field: 'county_fips',
        op: 'in',
        values: ['39049']
      });
    });

    it('should handle case-insensitive field names', () => {
      const result = parseAudienceRule("STATE == 'OH' or COUNTY_FIPS in ['39049']");
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses[0].field).toBe('state');
      expect(result.clauses[1].field).toBe('county_fips');
    });

    it('should handle case-insensitive OR operator', () => {
      const result = parseAudienceRule("state == 'OH' OR place == 'columbus,oh'");
      expect(result.clauses).toHaveLength(2);
    });

    it('should handle whitespace variations', () => {
      const result = parseAudienceRule("  state == 'OH'  or  county_fips in ['39049']  ");
      expect(result.clauses).toHaveLength(2);
    });

    it('should throw error for invalid syntax', () => {
      expect(() => parseAudienceRule("invalid syntax")).toThrow('Unsupported rule syntax');
    });

    it('should throw error for empty string', () => {
      expect(() => parseAudienceRule("")).toThrow('Audience rule must be a non-empty string');
    });

    it('should throw error for non-string input', () => {
      expect(() => parseAudienceRule(null as any)).toThrow('Audience rule must be a non-empty string');
    });

    it('should throw error for invalid list item format', () => {
      expect(() => parseAudienceRule("county_fips in ['39049',invalid]")).toThrow('Invalid list item format');
    });

    it('should throw error for empty array', () => {
      expect(() => parseAudienceRule("county_fips in []")).toThrow('Empty array in audience rule');
    });
  });

  describe('buildSupabaseFilters', () => {
    it('should build filters for equality clauses', () => {
      const parsed: ParsedRule = {
        clauses: [
          { field: 'state', op: 'eq', value: 'OH' },
          { field: 'place', op: 'eq', value: 'columbus,oh' }
        ]
      };

      const filters = buildSupabaseFilters(parsed);
      expect(filters).toHaveLength(2);
      expect(filters[0]).toEqual({
        field: 'state',
        value: 'OH',
        type: 'eq'
      });
      expect(filters[1]).toEqual({
        field: 'place',
        value: 'columbus,oh',
        type: 'eq'
      });
    });

    it('should build filters for array membership clauses', () => {
      const parsed: ParsedRule = {
        clauses: [
          { field: 'county_fips', op: 'in', values: ['39049', '39041'] }
        ]
      };

      const filters = buildSupabaseFilters(parsed);
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual({
        field: 'county_fips',
        values: ['39049', '39041'],
        type: 'in'
      });
    });
  });

  describe('executeAudienceRule', () => {
    it('should execute queries and return unique user_ids', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            { user_id: 'user1' },
            { user_id: 'user2' }
          ],
          error: null
        })
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQuery)
      };

      const parsed: ParsedRule = {
        clauses: [
          { field: 'state', op: 'eq', value: 'OH' }
        ]
      };

      const result = await executeAudienceRule(mockSupabase, parsed, 200);
      
      expect(result).toEqual(['user1', 'user2']);
      expect(mockSupabase.from).toHaveBeenCalledWith('v_subscriber_geo');
      expect(mockQuery.select).toHaveBeenCalledWith('user_id');
      expect(mockQuery.eq).toHaveBeenCalledWith('state', 'OH');
      expect(mockQuery.limit).toHaveBeenCalledWith(200);
    });

    it('should handle query errors gracefully', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('Database error')
        })
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQuery)
      };

      const parsed: ParsedRule = {
        clauses: [
          { field: 'state', op: 'eq', value: 'OH' }
        ]
      };

      const result = await executeAudienceRule(mockSupabase, parsed, 200);
      
      expect(result).toEqual([]);
    });

    it('should respect limit across all clauses', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: Array.from({ length: 150 }, (_, i) => ({ user_id: `user${i}` })),
          error: null
        })
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQuery)
      };

      const parsed: ParsedRule = {
        clauses: [
          { field: 'state', op: 'eq', value: 'OH' },
          { field: 'state', op: 'eq', value: 'MI' }
        ]
      };

      const result = await executeAudienceRule(mockSupabase, parsed, 200);
      
      // Should stop after first clause hits limit
      expect(result).toHaveLength(150);
    });
  });

  describe('validateAudienceRule', () => {
    it('should return true for valid rules', () => {
      expect(validateAudienceRule("state == 'OH'")).toBe(true);
      expect(validateAudienceRule("county_fips in ['39049','39041']")).toBe(true);
      expect(validateAudienceRule("state == 'OH' or place == 'columbus,oh'")).toBe(true);
    });

    it('should return false for invalid rules', () => {
      expect(validateAudienceRule("invalid syntax")).toBe(false);
      expect(validateAudienceRule("")).toBe(false);
      expect(validateAudienceRule("state == OH")).toBe(false); // Missing quotes
    });
  });

  describe('Real-world examples', () => {
    it('should parse Ohio-only rule', () => {
      const result = parseAudienceRule("state == 'OH'");
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0]).toEqual({
        field: 'state',
        op: 'eq',
        value: 'OH'
      });
    });

    it('should parse Franklin County rule', () => {
      const result = parseAudienceRule("county_fips in ['39049']");
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0]).toEqual({
        field: 'county_fips',
        op: 'in',
        values: ['39049']
      });
    });

    it('should parse Columbus or Michigan rule', () => {
      const result = parseAudienceRule("place == 'columbus,oh' or state == 'MI'");
      expect(result.clauses).toHaveLength(2);
      expect(result.clauses[0]).toEqual({
        field: 'place',
        op: 'eq',
        value: 'columbus,oh'
      });
      expect(result.clauses[1]).toEqual({
        field: 'state',
        op: 'eq',
        value: 'MI'
      });
    });

    it('should parse multi-county rule', () => {
      const result = parseAudienceRule("county_fips in ['39049','39041','39017']");
      expect(result.clauses).toHaveLength(1);
      expect(result.clauses[0]).toEqual({
        field: 'county_fips',
        op: 'in',
        values: ['39049', '39041', '39017']
      });
    });
  });
});
