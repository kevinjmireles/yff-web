/**
 * Test Seed Helper for Personalize API Tests
 *
 * Creates test data for validating personalization targeting hierarchy.
 * Follows the pattern from scripts/test-setup.mjs
 */

import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error('Missing Supabase environment variables for test seed')
}

const sb = createClient(url, key)

export type SeedArgs = {
  email: string
  userGeo: {
    state: string
    county_fips?: string
    place?: string
  }
  content: Array<{
    subject: string
    body_html?: string | null
    body_md?: string | null
    ocd_scope?: string | null
    metadata?: any | null
  }>
}

/**
 * Seed test data for personalization tests
 *
 * @param args - Test data configuration
 * @returns dataset_id - UUID of created dataset
 *
 * @example
 * const datasetId = await seedPersonalize({
 *   email: 'columbus2@myrepresentatives.com',
 *   userGeo: { state: 'oh', county_fips: '39049', place: 'columbus' },
 *   content: [
 *     { subject: 'Global Note', body_html: '<p>Global</p>' },
 *     { subject: 'Ohio Note', body_md: '<p>Ohio</p>', ocd_scope: 'state:oh' },
 *   ]
 * })
 */
export async function seedPersonalize(args: SeedArgs): Promise<string> {
  const dataset_id = randomUUID()

  // Build OCD IDs from user geo
  const ocdIds: string[] = []

  if (args.userGeo.state) {
    ocdIds.push(`ocd-division/country:us/state:${args.userGeo.state.toLowerCase()}`)
  }

  if (args.userGeo.place && args.userGeo.state) {
    ocdIds.push(
      `ocd-division/country:us/state:${args.userGeo.state.toLowerCase()}/place:${args.userGeo.place.toLowerCase()}`
    )
  }

  if (args.userGeo.county_fips) {
    const stFips = args.userGeo.county_fips.slice(0, 2)
    ocdIds.push(
      `ocd-division/country:us/state_fips:${stFips}/county_fips:${args.userGeo.county_fips}`
    )
  }

  // Upsert profile
  const { data: prof, error: profErr } = await sb
    .from('profiles')
    .upsert({
      email: args.email,
      ocd_ids: ocdIds,
      address: '123 Test St',
      zipcode: '00000',
    }, { onConflict: 'email' })
    .select('user_id')
    .single()

  if (profErr) {
    throw new Error(`Failed to upsert profile: ${profErr.message}`)
  }

  if (!prof) {
    throw new Error('Profile creation returned no data')
  }

  // Ensure geo metrics exist
  const geoMetrics = []
  if (args.userGeo.state) {
    geoMetrics.push({
      user_id: prof.user_id,
      metric_key: 'state',
      metric_value: args.userGeo.state.toUpperCase(),
      source: 'test-seed'
    })
  }
  if (args.userGeo.county_fips) {
    geoMetrics.push({
      user_id: prof.user_id,
      metric_key: 'county_fips',
      metric_value: args.userGeo.county_fips,
      source: 'test-seed'
    })
  }
  if (args.userGeo.place) {
    geoMetrics.push({
      user_id: prof.user_id,
      metric_key: 'place',
      metric_value: args.userGeo.place.toLowerCase(),
      source: 'test-seed'
    })
  }

  if (geoMetrics.length > 0) {
    const { error: geoErr } = await sb
      .from('geo_metrics')
      .upsert(geoMetrics, {
        onConflict: 'user_id,metric_key,metric_value',
        ignoreDuplicates: true
      })

    if (geoErr) {
      throw new Error(`Failed to upsert geo metrics: ${geoErr.message}`)
    }
  }

  // Create dataset entry
  const { error: datasetErr } = await sb
    .from('content_datasets')
    .insert({
      id: dataset_id,
      name: `test-personalize-${Date.now()}`,
      status: 'active'
    })

  if (datasetErr) {
    throw new Error(`Failed to create dataset: ${datasetErr.message}`)
  }

  // Insert content rows into staging
  const rows = args.content.map((c, idx) => ({
    dataset_id,
    row_uid: `test-row-${idx}`,
    subject: c.subject,
    body_html: c.body_html ?? null,
    body_md: c.body_md ?? null,
    ocd_scope: c.ocd_scope ?? null,
    metadata: c.metadata ?? null,
    created_at: new Date(Date.now() + idx).toISOString(), // Ensure unique timestamps
  }))

  const { error: contentErr } = await sb
    .from('v2_content_items_staging')
    .insert(rows)

  if (contentErr) {
    throw new Error(`Failed to insert content: ${contentErr.message}`)
  }

  return dataset_id
}

/**
 * Cleanup test data after tests
 */
export async function cleanupTestData(dataset_id: string, email: string) {
  // Delete content
  await sb
    .from('v2_content_items_staging')
    .delete()
    .eq('dataset_id', dataset_id)

  // Delete dataset
  await sb
    .from('content_datasets')
    .delete()
    .eq('id', dataset_id)

  // Note: We don't delete the profile as it might be reused
  // and geo_metrics will cascade delete if profile is removed
}
