/**
 * Content Import API Tests
 * 
 * Purpose: Validates v2_content_items aligned import functionality
 * 
 * Test Coverage:
 * - Blank external_id auto-generates row_uid
 * - Blank dates normalized to null
 * - Nuclear replace mode deletes all existing rows
 * - Surgical replace mode deletes only matching row_uids
 * - Race-safe dataset creation handles concurrent requests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const TEST_DATASET = 'Test Dataset - Import Tests'

// Test client setup (requires SUPABASE env vars)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

describe('Content Import API (v2_content_items aligned)', () => {
  
  beforeAll(async () => {
    // Clean up test dataset before running tests
    const { data: existing } = await supabase
      .from('content_datasets')
      .select('id')
      .ilike('name', TEST_DATASET)
      .maybeSingle()
    
    if (existing?.id) {
      await supabase.from('v2_content_items').delete().eq('dataset_id', existing.id)
      await supabase.from('content_datasets').delete().eq('id', existing.id)
    }
  })

  afterAll(async () => {
    // Clean up test dataset after tests complete
    const { data: existing } = await supabase
      .from('content_datasets')
      .select('id')
      .ilike('name', TEST_DATASET)
      .maybeSingle()
    
    if (existing?.id) {
      await supabase.from('v2_content_items').delete().eq('dataset_id', existing.id)
      await supabase.from('content_datasets').delete().eq('id', existing.id)
    }
  })

  it('generates row_uid when external_id is blank and normalizes blank dates', async () => {
    // Arrange: Row with no external_id and blank dates
    const testRow = {
      // external_id intentionally omitted
      title: 'Test Article - Auto Row UID',
      html: '<p>This article has no external_id</p>',
      geo_level: 'city',
      geo_code: 'Boise',
      start_date: '',  // blank → should become null
      end_date: '',    // blank → should become null
      topic: 'test',
      priority: 1,
      source_url: 'https://example.com/test'
    }

    const response = await fetch('http://localhost:3000/api/content/import', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
      },
      body: JSON.stringify({
        datasetName: TEST_DATASET,
        replaceMode: 'none',
        rows: [testRow],
        startRow: 0
      })
    })

    const result = await response.json()

    // Assert: Should succeed with auto-generated row_uid
    expect(result.ok).toBe(true)
    expect(result.code).toBe('CONTENT_IMPORT_OK')
    expect(result.data.inserted_or_updated).toBe(1)
    expect(result.data.skipped).toBe(0)
    expect(result.data.errors).toHaveLength(0)

    // Verify row in database
    const { data: items } = await supabase
      .from('v2_content_items')
      .select('*')
      .eq('dataset_id', result.data.dataset_id)
      .eq('subject', 'Test Article - Auto Row UID')
      .single()

    expect(items).toBeDefined()
    expect(items?.row_uid).toBeTruthy() // auto-generated
    expect(items?.subject).toBe('Test Article - Auto Row UID')
    expect(items?.ocd_scope).toBe('city:Boise')
    expect(items?.metadata.start_date).toBeNull()
    expect(items?.metadata.end_date).toBeNull()
    expect(items?.metadata.topic).toBe('test')
  })

  it('supports nuclear replace on first chunk', async () => {
    // Arrange: Create dataset with 2 rows
    const initialRows = [
      {
        external_id: 'old-1',
        title: 'Old Article 1',
        html: '<p>This will be deleted</p>',
        geo_level: 'state',
        geo_code: 'ID'
      },
      {
        external_id: 'old-2',
        title: 'Old Article 2',
        html: '<p>This will also be deleted</p>',
        geo_level: 'state',
        geo_code: 'ID'
      }
    ]

    // Insert initial rows
    await fetch('http://localhost:3000/api/content/import', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
      },
      body: JSON.stringify({
        datasetName: TEST_DATASET,
        replaceMode: 'none',
        rows: initialRows,
        startRow: 0
      })
    })

    // Act: Nuclear replace with new rows
    const newRows = [
      {
        external_id: 'new-1',
        title: 'New Article 1',
        html: '<p>This is new</p>',
        geo_level: 'state',
        geo_code: 'OH'
      }
    ]

    const response = await fetch('http://localhost:3000/api/content/import', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
      },
      body: JSON.stringify({
        datasetName: TEST_DATASET,
        replaceMode: 'nuclear',
        rows: newRows,
        startRow: 0  // Important: startRow === 0 triggers nuclear delete
      })
    })

    const result = await response.json()
    expect(result.ok).toBe(true)

    // Assert: Old rows deleted, new rows present
    const { data: items } = await supabase
      .from('v2_content_items')
      .select('row_uid')
      .eq('dataset_id', result.data.dataset_id)

    expect(items).toHaveLength(1)
    expect(items?.[0].row_uid).toBe('new-1')
  })

  it('supports surgical replace per chunk', async () => {
    // Arrange: Dataset has A, B
    const initialRows = [
      {
        external_id: 'row-a',
        title: 'Article A',
        html: '<p>Original A</p>',
        geo_level: 'city',
        geo_code: 'Boise'
      },
      {
        external_id: 'row-b',
        title: 'Article B',
        html: '<p>Original B</p>',
        geo_level: 'city',
        geo_code: 'NYC'
      }
    ]

    await fetch('http://localhost:3000/api/content/import', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
      },
      body: JSON.stringify({
        datasetName: TEST_DATASET,
        replaceMode: 'none',
        rows: initialRows,
        startRow: 0
      })
    })

    // Act: Upload chunk with A (modified) using surgical mode
    const modifiedRows = [
      {
        external_id: 'row-a',
        title: 'Article A - Updated',
        html: '<p>Modified A</p>',
        geo_level: 'city',
        geo_code: 'Boise'
      }
    ]

    const response = await fetch('http://localhost:3000/api/content/import', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
      },
      body: JSON.stringify({
        datasetName: TEST_DATASET,
        replaceMode: 'surgical',
        rows: modifiedRows,
        startRow: 0
      })
    })

    const result = await response.json()
    expect(result.ok).toBe(true)

    // Assert: A updated, B unchanged
    const { data: items } = await supabase
      .from('v2_content_items')
      .select('row_uid, subject')
      .eq('dataset_id', result.data.dataset_id)
      .order('row_uid')

    expect(items).toHaveLength(2)
    
    const itemA = items?.find(i => i.row_uid === 'row-a')
    const itemB = items?.find(i => i.row_uid === 'row-b')
    
    expect(itemA?.subject).toBe('Article A - Updated')
    expect(itemB?.subject).toBe('Article B') // unchanged
  })

  it('is race-safe for dataset creation (unique LOWER(name))', async () => {
    // This test simulates concurrent requests creating the same dataset
    // The second request should catch the 23505 error and retry successfully
    
    const uniqueDatasetName = `Test Dataset - Race ${Date.now()}`
    
    const row = {
      external_id: 'race-test-1',
      title: 'Race Test Article',
      html: '<p>Testing concurrent dataset creation</p>',
      geo_level: 'state',
      geo_code: 'ID'
    }

    // Act: Fire two concurrent requests
    const [result1, result2] = await Promise.all([
      fetch('http://localhost:3000/api/content/import', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
        },
        body: JSON.stringify({
          datasetName: uniqueDatasetName,
          replaceMode: 'none',
          rows: [row],
          startRow: 0
        })
      }).then(r => r.json()),
      fetch('http://localhost:3000/api/content/import', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
        },
        body: JSON.stringify({
          datasetName: uniqueDatasetName,
          replaceMode: 'none',
          rows: [row],
          startRow: 0
        })
      }).then(r => r.json())
    ])

    // Assert: Both requests should succeed
    expect(result1.ok).toBe(true)
    expect(result2.ok).toBe(true)
    
    // Both should reference the same dataset_id
    expect(result1.data.dataset_id).toBe(result2.data.dataset_id)

    // Verify only one dataset row created
    const { data: datasets } = await supabase
      .from('content_datasets')
      .select('id')
      .ilike('name', uniqueDatasetName)

    expect(datasets).toHaveLength(1)

    // Clean up
    if (datasets?.[0].id) {
      await supabase.from('v2_content_items').delete().eq('dataset_id', datasets[0].id)
      await supabase.from('content_datasets').delete().eq('id', datasets[0].id)
    }
  })
})


