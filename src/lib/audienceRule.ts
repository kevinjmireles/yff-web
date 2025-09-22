/**
 * Audience Rule Parser for V2.1 Content Targeting
 * 
 * V1 Grammar:
 * - Fields: state, county_fips, place
 * - Operations: == (equality), in [...] (array membership)
 * - Combiner: or (implicit OR between clauses)
 * 
 * Examples:
 * - "state == 'OH'"
 * - "county_fips in ['39049','39041']"
 * - "place == 'columbus,oh' or state == 'MI'"
 */

export type Clause =
  | { field: 'state'|'county_fips'|'place'; op: 'eq'; value: string }
  | { field: 'state'|'county_fips'|'place'; op: 'in'; values: string[] };

export type ParsedRule = { clauses: Clause[] }; // implicit OR between clauses

/**
 * Parse an audience rule string into structured clauses
 * @param src - Raw audience rule string
 * @returns Parsed rule with clauses
 * @throws Error if parsing fails
 */
export function parseAudienceRule(src: string): ParsedRule {
  if (!src || typeof src !== 'string') {
    throw new Error('Audience rule must be a non-empty string');
  }

  // Split on ' or ' (case-insensitive); trim whitespace
  const parts = src.split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean);
  
  if (parts.length === 0) {
    throw new Error('No valid clauses found in audience rule');
  }

  const clauses: Clause[] = [];

  for (const p of parts) {
    // Equality: field == 'value'
    let m = p.match(/^(state|county_fips|place)\s*==\s*'([^']+)'$/i);
    if (m) {
      clauses.push({ 
        field: m[1].toLowerCase() as 'state'|'county_fips'|'place', 
        op: 'eq', 
        value: m[2] 
      });
      continue;
    }

    // Array membership: field in ['a','b',...] or field in []
    m = p.match(/^(state|county_fips|place)\s*in\s*\[\s*([^\]]*)\s*\]$/i);
    if (m) {
      const raw = m[2].split(',').map(s => s.trim()).filter(Boolean);
      const vals = raw.map(v => {
        const mm = v.match(/^'([^']+)'$/);
        if (!mm) throw new Error(`Invalid list item format: ${v}`);
        return mm[1];
      });
      
      if (vals.length === 0) {
        throw new Error('Empty array in audience rule');
      }

      clauses.push({ 
        field: m[1].toLowerCase() as 'state'|'county_fips'|'place', 
        op: 'in', 
        values: vals 
      });
      continue;
    }

    throw new Error(`Unsupported rule syntax: ${p}`);
  }

  return { clauses };
}

/**
 * Build Supabase query filters for audience rule clauses
 * @param parsed - Parsed audience rule
 * @returns Object with query builder functions for each clause
 */
export function buildSupabaseFilters(parsed: ParsedRule) {
  return parsed.clauses.map(clause => {
    if (clause.op === 'eq') {
      return {
        field: clause.field,
        value: clause.value,
        type: 'eq' as const
      };
    } else {
      return {
        field: clause.field,
        values: clause.values,
        type: 'in' as const
      };
    }
  });
}

/**
 * Execute audience rule queries against v_subscriber_geo
 * @param supabase - Supabase client instance
 * @param parsed - Parsed audience rule
 * @param limit - Maximum number of results per clause
 * @returns Array of unique user_ids matching the rule
 */
export async function executeAudienceRule(
  supabase: any, // Supabase client type
  parsed: ParsedRule,
  limit: number = 200
): Promise<string[]> {
  const allUserIds = new Set<string>();
  const filters = buildSupabaseFilters(parsed);

  for (const filter of filters) {
    try {
      // Build the query step by step
      const query = supabase.from('v_subscriber_geo').select('user_id');
      
      let finalQuery;
      if (filter.type === 'eq') {
        finalQuery = query.eq(filter.field, filter.value);
      } else {
        finalQuery = query.in(filter.field, filter.values);
      }

      const { data, error } = await finalQuery.limit(limit);

      if (error) {
        console.error(`Audience rule query failed for ${filter.field}:`, error);
        continue; // Skip this clause, continue with others
      }

      if (data) {
        data.forEach((row: any) => {
          if (row.user_id) {
            allUserIds.add(row.user_id);
          }
        });
      }

      // If we've hit the limit, stop processing more clauses
      if (allUserIds.size >= limit) {
        break;
      }
    } catch (error) {
      console.error(`Error executing audience rule clause:`, error);
      continue; // Skip this clause, continue with others
    }
  }

  return Array.from(allUserIds).slice(0, limit);
}

/**
 * Validate audience rule syntax without executing
 * @param src - Raw audience rule string
 * @returns true if valid, false otherwise
 */
export function validateAudienceRule(src: string): boolean {
  try {
    parseAudienceRule(src);
    return true;
  } catch {
    return false;
  }
}
