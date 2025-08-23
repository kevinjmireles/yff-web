// Purpose: A minimal admin form to trigger a campaign send via a Make.com webhook.
// Called by: Admins navigating to /admin/campaigns.
// Env: NEXT_PUBLIC_MAKE_WEBHOOK_URL - The Make.com webhook to trigger.

'use client'

import { useState } from 'react'
import { adminTriggerSchema } from '@/lib/schema'
import { logError } from '@/lib/errors'

export default function AdminCampaignsPage() {
  const [payload, setPayload] = useState({
    campaign_tag: 'test-tag-01',
    subject: 'Test Subject',
    body_template_id: 'sendgrid-template-id',
    test_recipients: 'test@example.com',
  })
  const [status, setStatus] = useState<string | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPayload(prev => ({ ...prev, [name]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('Validating and sending...')

    const parsed = adminTriggerSchema.safeParse({
      ...payload,
      // Split comma-separated string into an array for validation
      test_recipients: payload.test_recipients
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    })

    if (!parsed.success) {
      setStatus(`Validation failed: ${parsed.error.errors[0].message}`)
      return
    }

    const webhookUrl = process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL
    if (!webhookUrl) {
      const msg = 'Make.com webhook URL is not configured.'
      setStatus(msg)
      logError(msg, 'NEXT_PUBLIC_MAKE_WEBHOOK_URL not set in .env.local')
      return
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      
      const resText = await res.text()
      setStatus(`Webhook response: ${res.status} ${res.statusText} - ${resText}`)

    } catch (error) {
      setStatus('Failed to send webhook.')
      logError('Admin webhook trigger failed', error)
    }
  }

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Trigger Campaign</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input name="campaign_tag" value={payload.campaign_tag} onChange={handleInputChange} placeholder="Campaign Tag" className="border p-2 w-full" />
        <input name="subject" value={payload.subject} onChange={handleInputChange} placeholder="Subject" className="border p-2 w-full" />
        <input name="body_template_id" value={payload.body_template_id} onChange={handleInputChange} placeholder="Body Template ID" className="border p-2 w-full" />
        <input name="test_recipients" value={payload.test_recipients} onChange={handleInputChange} placeholder="Test Recipients (comma-separated)" className="border p-2 w-full" />
        <button type="submit" className="px-4 py-2 bg-black text-white rounded">
          Trigger Webhook
        </button>
      </form>
      {status && <p className="mt-3 font-mono text-sm">{status}</p>}
    </main>
  )
}
