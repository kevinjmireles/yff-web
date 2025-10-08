import { describe, it, expect } from 'vitest'
import { randomUUID } from 'crypto'

const BASE = process.env.BASE // e.g., https://yff-web.vercel.app
const ADMIN = process.env.ADMIN_API_TOKEN // matches Vercel ADMIN_API_TOKEN
const SHARED = process.env.MAKE_SHARED_TOKEN // matches Vercel MAKE_SHARED_TOKEN

async function execTest(job: string): Promise<string> {
  if (!BASE || !ADMIN) throw new Error('Missing BASE or ADMIN_API_TOKEN env for E2E test')
  const r = await fetch(`${BASE}/api/send/execute`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: job, mode: 'test', emails: ['a@example.com','b@example.com'] }),
  })
  const json: any = await r.json()
  expect(r.status).toBe(200)
  expect(json?.data?.dataset_id).toBe('00000000-0000-0000-0000-000000000001')
  expect(json?.data?.batch_id).toBeTruthy()
  return json.data.batch_id as string
}

async function callback(payload: any) {
  if (!BASE || !SHARED) throw new Error('Missing BASE or MAKE_SHARED_TOKEN env for E2E test')
  const r = await fetch(`${BASE}/api/provider/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shared-Token': SHARED },
    body: JSON.stringify(payload),
  })
  const text = await r.text()
  if (r.status !== 200) {
    throw new Error(`Callback HTTP ${r.status}: ${text}`)
  }
}

describe('YFF send pipeline (test mode)', () => {
  it('execute → callback (with & without provider_message_id) are 200 and replays are idempotent', async () => {
    const job = randomUUID()
    const batch = await execTest(job)

    // With provider_message_id (unique per run)
    const withId = {
      job_id: job, batch_id: batch, results: [
        { email: 'a@example.com', status: 'delivered', provider_message_id: `SG-${job}-1` },
        { email: 'b@example.com', status: 'failed',    provider_message_id: `SG-${job}-2`, error: 'bounce' },
      ],
    }
    await callback(withId)
    await callback(withId) // replay

    // Without provider_message_id (fallback)
    const noId = {
      job_id: job, batch_id: batch, results: [
        { email: 'a@example.com', status: 'delivered' },
        { email: 'b@example.com', status: 'failed', error: 'bounce' },
      ],
    }
    await callback(noId)
    await callback(noId) // replay
  }, 30_000)
})


