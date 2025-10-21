/**
 * Personalize API Tests
 *
 * Validates the content targeting hierarchy:
 * 1. audience_rule (highest priority)
 * 2. ocd_scope (geographic targeting)
 * 3. global (no targeting, fallback)
 *
 * Also validates:
 * - body_html preferred over body_md
 * - Deterministic selection (specificity → priority → recency)
 * - Token resolution
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { seedPersonalize, cleanupTestData } from '../helpers/seed-personalize'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

async function getJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`)
  const json = await res.json()
  return { status: res.status, json }
}

describe('Personalize API - Targeting Hierarchy', () => {
  let fullDatasetId: string
  const testEmail = 'columbus2@myrepresentatives.com'

  beforeAll(async () => {
    // Seed comprehensive test data with all targeting types
    fullDatasetId = await seedPersonalize({
      email: testEmail,
      userGeo: { state: 'oh', county_fips: '39049', place: 'columbus' },
      content: [
        {
          subject: 'Global Note',
          body_html: '<p>Global</p>',
          ocd_scope: null,
          metadata: { priority: 100 }
        },
        {
          subject: 'Ohio State Note',
          body_md: '<p>Ohio State</p>',
          ocd_scope: 'state:oh',
          metadata: { priority: 50 }
        },
        {
          subject: 'Columbus City Headline',
          body_html: '<p>Columbus City</p>',
          ocd_scope: 'place:columbus,oh',
          metadata: { priority: 10 }
        },
        {
          subject: 'Audience VIP Segment',
          body_html: '<p>VIP Audience</p>',
          metadata: {
            priority: 5,
            audience_rule: JSON.stringify({
              any: [{ level: 'state', op: 'eq', value: 'OH' }]
            })
          }
        }
      ]
    })
  })

  afterAll(async () => {
    await cleanupTestData(fullDatasetId, testEmail)
  })

  it('should prefer audience_rule over ocd_scope and global', async () => {
    const { status, json } = await getJson(
      `/api/send/personalize?email=${testEmail}&dataset_id=${fullDatasetId}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.subject).toBe('Audience VIP Segment')
    expect(json.html).toContain('<p>VIP Audience</p>')
  })

  it('should use ocd_scope (place beats state) when no audience match', async () => {
    // Seed dataset without audience_rule targeting
    const ds2 = await seedPersonalize({
      email: testEmail,
      userGeo: { state: 'oh', county_fips: '39049', place: 'columbus' },
      content: [
        { subject: 'Global Note', body_html: '<p>Global</p>', metadata: { priority: 100 } },
        { subject: 'Ohio State', body_md: '<p>Ohio</p>', ocd_scope: 'state:oh', metadata: { priority: 50 } },
        { subject: 'Columbus City', body_html: '<p>Columbus</p>', ocd_scope: 'place:columbus,oh', metadata: { priority: 10 } },
      ]
    })

    const { status, json } = await getJson(
      `/api/send/personalize?email=${testEmail}&dataset_id=${ds2}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.subject).toBe('Columbus City') // place > state specificity
    expect(json.html).toContain('<p>Columbus</p>')

    await cleanupTestData(ds2, testEmail)
  })

  it('should fall back to global when no geo match', async () => {
    const unknownEmail = 'unknown@example.com'

    const ds3 = await seedPersonalize({
      email: unknownEmail,
      userGeo: { state: 'xx' }, // Non-matching state
      content: [
        { subject: 'Global Note', body_html: '<p>Global Content</p>' },
        { subject: 'Ohio Note', body_md: '<p>Ohio Only</p>', ocd_scope: 'state:oh', metadata: { priority: 5 } },
      ]
    })

    const { status, json } = await getJson(
      `/api/send/personalize?email=${unknownEmail}&dataset_id=${ds3}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.subject).toBe('Global Note')
    expect(json.html).toContain('<p>Global Content</p>')

    await cleanupTestData(ds3, unknownEmail)
  })

  it('should prefer body_html over body_md when both exist', async () => {
    const ds4 = await seedPersonalize({
      email: testEmail,
      userGeo: { state: 'oh', place: 'columbus' },
      content: [
        {
          subject: 'Both Bodies',
          body_html: '<p>HTML Wins</p>',
          body_md: '<p>MD Fallback</p>',
          ocd_scope: 'place:columbus,oh'
        }
      ]
    })

    const { status, json } = await getJson(
      `/api/send/personalize?email=${testEmail}&dataset_id=${ds4}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.subject).toBe('Both Bodies')
    expect(json.html).toContain('HTML Wins')
    expect(json.html).not.toContain('MD Fallback')

    await cleanupTestData(ds4, testEmail)
  })

  it('should fall back to body_md when body_html is null', async () => {
    const ds5 = await seedPersonalize({
      email: testEmail,
      userGeo: { state: 'oh', place: 'columbus' },
      content: [
        {
          subject: 'MD Only',
          body_html: null,
          body_md: '<p>Markdown Content</p>',
          ocd_scope: 'place:columbus,oh'
        }
      ]
    })

    const { status, json } = await getJson(
      `/api/send/personalize?email=${testEmail}&dataset_id=${ds5}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.subject).toBe('MD Only')
    expect(json.html).toContain('<p>Markdown Content</p>')

    await cleanupTestData(ds5, testEmail)
  })

  it('should respect priority when specificity is equal', async () => {
    const ds6 = await seedPersonalize({
      email: testEmail,
      userGeo: { state: 'oh', place: 'columbus' },
      content: [
        {
          subject: 'Columbus Low Priority',
          body_html: '<p>Low</p>',
          ocd_scope: 'place:columbus,oh',
          metadata: { priority: 100 }
        },
        {
          subject: 'Columbus High Priority',
          body_html: '<p>High</p>',
          ocd_scope: 'place:columbus,oh',
          metadata: { priority: 1 }
        }
      ]
    })

    const { status, json } = await getJson(
      `/api/send/personalize?email=${testEmail}&dataset_id=${ds6}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.subject).toBe('Columbus High Priority') // Lower number = higher priority
    expect(json.html).toContain('<p>High</p>')

    await cleanupTestData(ds6, testEmail)
  })

  it('should return 404 when profile not found', async () => {
    const { status, json } = await getJson(
      `/api/send/personalize?email=nonexistent@example.com&dataset_id=${fullDatasetId}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(404)
    expect(json.ok).toBe(false)
    expect(json.error).toBe('PROFILE_NOT_FOUND')
  })

  it('should return 400 when email is missing', async () => {
    const { status, json } = await getJson(
      `/api/send/personalize?dataset_id=${fullDatasetId}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(400)
    expect(json.ok).toBe(false)
    expect(json.error).toBe('INVALID_PARAMS')
  })
})

describe('Personalize API - Token Resolution', () => {
  let datasetId: string
  const testEmail = 'tokens@test.com'

  beforeAll(async () => {
    datasetId = await seedPersonalize({
      email: testEmail,
      userGeo: { state: 'oh' },
      content: [
        {
          subject: 'Token Test',
          body_html: '<p>Email: [[EMAIL]]</p><p>Job: [[JOB_ID]]</p>',
        }
      ]
    })
  })

  afterAll(async () => {
    await cleanupTestData(datasetId, testEmail)
  })

  it('should resolve [[EMAIL]] token', async () => {
    const { status, json } = await getJson(
      `/api/send/personalize?email=${testEmail}&dataset_id=${datasetId}&job_id=${crypto.randomUUID()}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.html).toContain(`Email: ${testEmail}`)
    expect(json.html).not.toContain('[[EMAIL]]')
  })

  it('should resolve [[JOB_ID]] token', async () => {
    const jobId = crypto.randomUUID()
    const { status, json } = await getJson(
      `/api/send/personalize?email=${testEmail}&dataset_id=${datasetId}&job_id=${jobId}&batch_id=${crypto.randomUUID()}`
    )

    expect(status).toBe(200)
    expect(json.html).toContain(`Job: ${jobId}`)
    expect(json.html).not.toContain('[[JOB_ID]]')
  })
})
