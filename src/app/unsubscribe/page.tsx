// Purpose: Allow users to unsubscribe from a mailing list.
// Called by: Links in emails.
'use client'

import { useState } from 'react'

export default function UnsubscribePage() {
  const [email, setEmail] = useState('')
  const [listKey, setListKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('Processing...')

    // For now, just echo the data to a test endpoint.
    // This will be replaced with a call to an edge function later.
    const res = await fetch('/api/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, listKey, action: 'unsubscribe' }),
    })

    if (res.ok) {
      setStatus(`Successfully unsubscribed ${email} from list.`)
    } else {
      setStatus('Something went wrong. Please try again.')
    }
  }

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Unsubscribe</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="border p-2 w-full"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
          required
        />
        <input
          className="border p-2 w-full"
          placeholder="List Key (from email)"
          value={listKey}
          onChange={e => setListKey(e.target.value)}
          required
        />
        <button
          type="submit"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Unsubscribe
        </button>
      </form>
      {status && <p className="mt-3">{status}</p>}
    </main>
  )
}
