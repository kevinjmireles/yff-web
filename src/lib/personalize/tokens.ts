// src/lib/personalize/tokens.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type TokenContext = {
  email: string
  job_id: string
  batch_id?: string
  ocd_ids?: string[] | null
}

/**
 * Extract state and congressional district from OCD IDs.
 * Examples:
 *   'ocd-division/country:us/state:ca' → state='CA'
 *   'ocd-division/country:us/state:ca/cd:38' → state='CA', cd='38'
 */
function extractStateAndCd(ocd_ids: string[] = []): { state: string | null; cd: string | null } {
  let state: string | null = null
  let cd: string | null = null

  for (const id of ocd_ids) {
    const mState = id.match(/state:([a-z]{2})\b/i)
    if (mState) state = mState[1].toUpperCase()

    const mCd = id.match(/\/cd:(\d+)\b/i)
    if (mCd) cd = String(Number(mCd[1])) // normalize '03' → '3'
  }

  return { state, cd }
}

/**
 * Fetch congressional delegation (2 senators + 1 rep) from database.
 * Returns senators for the state and house rep for the district (if available).
 */
async function fetchCongressionalDelegation(state: string, cd: string | null) {
  // Fetch senators by state
  const { data: senatorsData, error: senatorsError } = await supabaseAdmin
    .from('officials')
    .select(`
      official_id,
      full_name,
      office_type,
      state,
      district,
      official_contacts!inner (
        method,
        value,
        is_active
      )
    `)
    .eq('office_type', 'us_senate')
    .eq('state', state)
    .eq('is_active', true)
    .eq('official_contacts.is_active', true)

  if (senatorsError) {
    console.error('[tokens] Error fetching senators:', senatorsError)
  }

  // Fetch house rep by state and district (if we have cd)
  let repData: any[] = []
  if (cd) {
    const { data, error: repError } = await supabaseAdmin
      .from('officials')
      .select(`
        official_id,
        full_name,
        office_type,
        state,
        district,
        official_contacts!inner (
          method,
          value,
          is_active
        )
      `)
      .eq('office_type', 'us_house')
      .eq('state', state)
      .eq('district', parseInt(cd, 10))
      .eq('is_active', true)
      .eq('official_contacts.is_active', true)

    if (repError) {
      console.error('[tokens] Error fetching house rep:', repError)
    } else {
      repData = data ?? []
    }
  }

  // Combine and deduplicate contacts by official
  const allOfficials = [...(senatorsData ?? []), ...repData]

  // Group contacts by official_id
  const officialsMap = new Map<string, {
    name: string
    office_type: string
    state: string
    district: number | null
    website: string | null
    phone: string | null
  }>()

  for (const official of allOfficials) {
    if (!officialsMap.has(official.official_id)) {
      officialsMap.set(official.official_id, {
        name: official.full_name,
        office_type: official.office_type,
        state: official.state,
        district: official.district,
        website: null,
        phone: null
      })
    }

    const entry = officialsMap.get(official.official_id)!

    // Extract contacts (official_contacts is an array)
    const contacts = Array.isArray(official.official_contacts) ? official.official_contacts : []
    for (const contact of contacts) {
      if (contact.method === 'webform' && !entry.website) {
        entry.website = contact.value
      }
      if (contact.method === 'phone' && !entry.phone) {
        entry.phone = contact.value
      }
    }
  }

  // Split into senators and rep
  const senators: typeof officialsMap extends Map<string, infer T> ? T[] : never = []
  let rep: typeof officialsMap extends Map<string, infer T> ? T | null : never = null

  for (const official of officialsMap.values()) {
    if (official.office_type === 'us_senate') {
      senators.push(official)
    } else if (official.office_type === 'us_house') {
      rep = official
    }
  }

  return { senators, rep }
}

/**
 * Format phone number for display: (202) 224-3553
 */
function formatPhone(n?: string | null): string {
  if (!n) return ''
  const digits = n.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return n
}

/**
 * Escape HTML special characters
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return map[m] || m
  })
}

/**
 * Replace [[DELEGATION]] token with congressional delegation contact block.
 * Returns HTML list with senators and house rep, including website links and phone numbers.
 */
async function resolveDelegationToken(email: string, ocd_ids?: string[] | null): Promise<string> {
  // Load ocd_ids from profile if not provided
  let ids = ocd_ids
  if (!ids) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('ocd_ids')
      .eq('email', email)
      .maybeSingle()
    ids = data?.ocd_ids ?? []
  }

  // Extract state and congressional district
  const { state, cd } = extractStateAndCd(ids || [])
  if (!state) {
    return '<p><em>Representative information unavailable</em></p>'
  }

  // Fetch delegation from database
  const { senators, rep } = await fetchCongressionalDelegation(state, cd)

  // Build list items
  const items: Array<{ name: string; website: string | null; phone: string | null }> = []

  for (const senator of senators) {
    items.push({
      name: `Senator ${senator.name}`,
      website: senator.website,
      phone: senator.phone
    })
  }

  if (rep) {
    const districtLabel = rep.district ? ` (${rep.state}-${rep.district})` : ''
    items.push({
      name: `Rep. ${rep.name}${districtLabel}`,
      website: rep.website,
      phone: rep.phone
    })
  }

  if (items.length === 0) {
    return '<p><em>Representative information unavailable</em></p>'
  }

  // Format as HTML list
  const listItems = items.map(item => {
    const name = escapeHtml(item.name)
    const website = item.website
      ? `<br />(<a href="${escapeHtml(item.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.website)}</a>)`
      : ''
    const phone = item.phone
      ? `<br /><a href="tel:${escapeHtml(item.phone)}">${formatPhone(item.phone)}</a>`
      : ''
    return `<li>${name}${website}${phone}</li>`
  }).join('')

  return `<ul>${listItems}</ul>`
}

/**
 * Replace tokens with dynamic content.
 * Supports: [[DELEGATION]], [[EMAIL]], [[JOB_ID]], [[BATCH_ID]]
 *
 * BREAKING CHANGE: This function is now async due to database lookups.
 * All callers must await this function.
 *
 * @param html - HTML string containing tokens to replace
 * @param ctx - Context object with user/job information
 * @returns Promise resolving to HTML with tokens replaced
 */
export async function resolveTokens(html: string, ctx: TokenContext): Promise<string> {
  let out = html ?? ''

  // [[DELEGATION]] - render congressional representatives from database
  if (out.includes('[[DELEGATION]]')) {
    const delegationHtml = await resolveDelegationToken(ctx.email, ctx.ocd_ids)
    out = out.replace(/\[\[DELEGATION\]\]/g, delegationHtml)
  }

  // [[EMAIL]] - user's email address
  out = out.replace(/\[\[EMAIL\]\]/g, ctx.email)

  // [[JOB_ID]] - current job identifier
  out = out.replace(/\[\[JOB_ID\]\]/g, ctx.job_id)

  // [[BATCH_ID]] - current batch identifier
  if (ctx.batch_id) {
    out = out.replace(/\[\[BATCH_ID\]\]/g, ctx.batch_id)
  }

  // TODO: Add more tokens here as needed
  // Examples: [[FIRST_NAME]], [[CITY]], [[STATE]], etc.

  return out
}
