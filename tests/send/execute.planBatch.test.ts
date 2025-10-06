import { describe, it, expect } from 'vitest'
import { planBatch, type Recipient, type HistoryRow } from '../../src/lib/send/planBatch'

describe('planBatch', () => {
  const recipients: Recipient[] = [
    { email: 'a@example.com' },
    { email: 'b@example.com' },
    { email: 'c@example.com' },
  ]

  it('caps by maxPerRun', () => {
    const res = planBatch({
      mode: 'cohort',
      requested: recipients,
      maxPerRun: 2,
      dataset_id: 'ds1',
      existing: []
    })
    expect(res.selected).toBe(2)
    expect(res.queued).toBe(2)
  })

  it('dedupes by dataset_id + email', () => {
    const existing: HistoryRow[] = [
      { email: 'b@example.com', dataset_id: 'ds1', status: 'delivered' }
    ]
    const res = planBatch({
      mode: 'cohort',
      requested: recipients,
      maxPerRun: 10,
      dataset_id: 'ds1',
      existing
    })
    expect(res.selected).toBe(3)
    expect(res.deduped).toBe(1)
    expect(res.toEnqueue.map(r => r.email)).toEqual(['a@example.com','c@example.com'])
  })

  it('test mode still reports but caller will not persist', () => {
    const res = planBatch({
      mode: 'test',
      requested: recipients,
      maxPerRun: 10,
      dataset_id: 'ds1',
      existing: []
    })
    expect(res.selected).toBe(3)
    expect(res.queued).toBe(3)
  })
})
