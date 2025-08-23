// Purpose: Allow users to view and update their subscription preferences.
// Called by: User navigation.
'use client'

import { useState } from 'react'
import { APP_NAME } from '@/lib/constants'

export default function PreferencesPage() {
  const [status, setStatus] = useState('')

  // Stub handler for now
  async function onUpdatePreferences(e: React.FormEvent) {
    e.preventDefault()
    console.log('Preferences update not wired yet.')
    setStatus('Preference updates are not enabled yet.')
  }

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">{APP_NAME} Preferences</h1>
      <p className="mb-4">
        Your email: <strong>user@example.com</strong>
      </p>

      <form onSubmit={onUpdatePreferences} className="space-y-3">
        <p>Your current subscriptions:</p>
        <ul className="list-disc list-inside">
          <li>City Council Meetings</li>
          <li>Mayoral Race Updates</li>
        </ul>
        <button
          type="submit"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Update (not wired)
        </button>
      </form>

      {status && <p className="mt-3">{status}</p>}
    </main>
  )
}
