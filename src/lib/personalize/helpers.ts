/**
 * Personalization Helpers
 *
 * Pure functions for evaluating content targeting rules in-memory.
 * No database queries - all evaluation happens against user context objects.
 *
 * Hierarchy:
 * 1. audience_rule (metadata) - most specific, custom targeting
 * 2. ocd_scope - geographic targeting
 * 3. global - no targeting (fallback)
 */

import { z } from 'zod'

export type GeoCtx = {
  state?: string | null
  county_fips?: string | null
  place?: string | null
}

export type ContentRow = {
  subject: string | null
  body_html: string | null
  body_md: string | null
  ocd_scope: string | null
  metadata: any | null
  created_at: string
}

const AudienceRule = z.object({
  any: z.array(z.object({
    level: z.enum(['state','county','place']),
    op: z.enum(['eq','in']),
    value: z.union([z.string(), z.array(z.string())]),
  })).optional(),
  all: z.array(z.object({
    level: z.enum(['state','county','place']),
    op: z.enum(['eq','in']),
    value: z.union([z.string(), z.array(z.string())]),
  })).optional(),
}).partial()

export type AudienceRuleT = z.infer<typeof AudienceRule>

/**
 * Safely parse audience rule from unknown input
 * Accepts stringified JSON or object
 */
export function safeParseRule(raw: unknown): AudienceRuleT {
  if (typeof raw === 'string') {
    try { return AudienceRule.parse(JSON.parse(raw)) } catch { return {} }
  }
  try { return AudienceRule.parse(raw) } catch { return {} }
}

/**
 * Evaluate audience rule against user geo context in-memory
 * No database queries - pure function
 *
 * @param rule - Parsed audience rule with any/all clauses
 * @param geo - User's geographic context from v_subscriber_geo
 * @returns true if user matches rule, false otherwise
 */
export function evaluateAudienceRuleInMemory(rule: AudienceRuleT, geo: GeoCtx): boolean {
  if (!rule.any && !rule.all) return false

  const check = (level: 'state'|'county'|'place', op: 'eq'|'in', value: string|string[]) => {
    const v = (level === 'state' ? geo.state
            : level === 'county' ? geo.county_fips
            : geo.place) ?? ''
    if (op === 'eq') {
      return norm(v) === norm(String(value))
    } else {
      const arr = Array.isArray(value) ? value : [String(value)]
      return arr.map(norm).includes(norm(v))
    }
  }

  const anyOk = !rule.any || rule.any.some(c => check(c.level, c.op, c.value as any))
  const allOk = !rule.all || rule.all.every(c => check(c.level, c.op, c.value as any))
  return anyOk && allOk
}

/**
 * Check if content's ocd_scope matches user's OCD IDs
 * Supports exact match or ancestor match
 *
 * @param scope - Content's ocd_scope (shorthand or full OCD ID)
 * @param userOcdIds - User's OCD IDs from profile
 * @returns true if match found, false otherwise
 *
 * @example
 * matchesOcdScope('state:oh', ['ocd-division/country:us/state:oh/place:columbus'])
 * // returns true (user has Columbus, content targets Ohio - ancestor match)
 */
export function matchesOcdScope(scope: string, userOcdIds: string[]): boolean {
  const targets = normalizeOcdScope(scope)
  if (!targets.length) return false
  // exact or ancestor match
  return targets.some(target =>
    userOcdIds.some(id => id === target || id.startsWith(target + '/'))
  )
}

/**
 * Normalize ocd_scope to full OCD division IDs
 * Accepts shorthand notation or full OCD IDs
 *
 * @param scope - OCD scope in various formats
 * @returns Array of normalized OCD division IDs
 *
 * @example
 * normalizeOcdScope('state:oh')
 * // => ['ocd-division/country:us/state:oh']
 *
 * normalizeOcdScope('place:columbus,oh')
 * // => ['ocd-division/country:us/state:oh/place:columbus']
 *
 * normalizeOcdScope('county:39049')
 * // => ['ocd-division/country:us/state_fips:39/county_fips:39049']
 *
 * normalizeOcdScope('ocd-division/country:us/state:oh')
 * // => ['ocd-division/country:us/state:oh'] (passthrough)
 */
export function normalizeOcdScope(scope: string): string[] {
  if (scope.startsWith('ocd-division/')) return [scope]

  const [level, raw] = scope.split(':')
  if (!level || !raw) return []

  if (level === 'state') {
    return [`ocd-division/country:us/state:${norm(raw)}`]
  }
  if (level === 'place') {
    const [place, st] = raw.split(',')
    if (!place || !st) return []
    return [`ocd-division/country:us/state:${norm(st)}/place:${norm(place)}`]
  }
  if (level === 'county') {
    const r = raw.trim()
    if (/^\d{5}$/.test(r)) {
      // FIPS code format
      const stFips = r.slice(0, 2)
      return [`ocd-division/country:us/state_fips:${stFips}/county_fips:${r}`]
    } else {
      // Name format: "franklin,oh"
      const [name, st] = r.split(',')
      if (!name || !st) return []
      return [`ocd-division/country:us/state:${norm(st)}/county:${norm(name)}`]
    }
  }
  return []
}

/**
 * Pick best content from array based on specificity, priority, and recency
 *
 * Specificity hierarchy:
 * 1. audience_rule (4) - custom targeting, most specific
 * 2. place (3)
 * 3. county (2)
 * 4. state (1)
 * 5. global (0) - no targeting
 *
 * Tiebreakers:
 * 1. Lower metadata.priority number (higher actual priority)
 * 2. Newer created_at timestamp
 *
 * @param items - Array of content rows
 * @returns Best matching content row, or null if empty array
 */
export function pickBest(items: ContentRow[]): ContentRow | null {
  if (!items.length) return null

  const spec = (r: ContentRow) => {
    const s = (r.ocd_scope ?? '').toLowerCase()
    if (r.metadata?.audience_rule) return 4 // audience segment is most specific
    if (s.includes('/place:') || s.startsWith('place:')) return 3
    if (s.includes('/county:') || s.includes('county_fips:') || s.startsWith('county:')) return 2
    if (s.includes('/state:') || s.startsWith('state:')) return 1
    return 0
  }
  const prio = (r: ContentRow) => {
    const p = Number(r.metadata?.priority)
    return Number.isFinite(p) ? p : 9999
  }

  return [...items].sort((a,b) =>
    spec(b) - spec(a) ||                 // more specific first
    prio(a) - prio(b) ||                 // lower priority number first
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime() // newer first
  )[0] ?? null
}

/**
 * Normalize string for case-insensitive comparison
 */
export function norm(s: string) {
  return s.trim().toLowerCase()
}
