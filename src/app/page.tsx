'use client'

/**
 * file: app/page.tsx
 * purpose: Public landing page + signup form (Make‑first flow)
 * calls: POST /api/signup
 * notes:
 * - reCAPTCHA is optional; if NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing, a helpful warning is shown.
 * - No DB writes here; the server route verifies captcha and (optionally) forwards to Make.
 */

import Link from 'next/link'
import Image from 'next/image'
import { useState, useRef } from 'react'
import ReCAPTCHA from 'react-google-recaptcha'
import Footer from '@/components/Footer'

type SignupResult =
  | { success: true; message: string; data?: { districtsFound?: number; subscriberId?: string } }
  | { success: false; error: string }

function SignupForm() {
  const [formData, setFormData] = useState({ name: '', email: '', address: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<SignupResult | null>(null)
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null)
  const recaptchaRef = useRef<ReCAPTCHA>(null)

  const hasSiteKey = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY)

  function onChange<K extends keyof typeof formData>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData(prev => ({ ...prev, [key]: e.target.value }))
      if (result) setResult(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)

    if (!formData.email || !formData.address) {
      setResult({ success: false, error: 'Please fill in your email and address.' })
      return
    }

    if (hasSiteKey && !recaptchaToken) {
      setResult({ success: false, error: 'Please complete the reCAPTCHA challenge.' })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, recaptchaToken }),
      })
      const data = (await res.json()) as SignupResult
      setResult(data)
      if (data.success) {
        setFormData({ name: '', email: '', address: '' })
        recaptchaRef.current?.reset()
        setRecaptchaToken(null)
      }
    } catch (err: any) {
      setResult({ success: false, error: 'Signup failed. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-xl p-6">
      <h3 className="text-2xl font-bold text-gray-900 mb-4 text-center">Join the Movement</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name (Optional)</label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={onChange('name')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Your full name"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address *</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={onChange('email')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="your.email@example.com"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700">Full Address *</label>
          <textarea
            id="address"
            name="address"
            required
            rows={2}
            value={formData.address}
            onChange={onChange('address')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="123 Main Street, City, State 12345"
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-gray-500">Include street address, city, state, and ZIP code</p>
        </div>

        {/* reCAPTCHA (optional in dev) */}
        <div className="flex justify-center">
          {hasSiteKey ? (
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
              onChange={setRecaptchaToken}
            />
          ) : (
            <div className="text-sm text-red-600 text-center">
              reCAPTCHA key missing. Set <code>NEXT_PUBLIC_RECAPTCHA_SITE_KEY</code> in <code>.env.local</code>.
              You can still test without it.
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !formData.email || !formData.address || (hasSiteKey && !recaptchaToken)}
          className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            isSubmitting || !formData.email || !formData.address || (hasSiteKey && !recaptchaToken)
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }`}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Finding Your Districts...
            </>
          ) : (
            'Sign Up Today'
          )}
        </button>
      </form>

      {/* Results */}
      {result && (
        <div className="mt-4">
          {result.success ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">🎉 Welcome to Your Friend Fido!</h3>
                  <div className="mt-1 text-sm text-green-700">
                    <p>{'Thanks for signing up—watch your inbox!'}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                                 <div className="ml-3">
                   <h3 className="text-sm font-medium text-red-800">Signup Failed</h3>
                   <div className="mt-1 text-sm text-red-700"><p>{result.error}</p></div>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header with Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/Fido_Logo.png" alt="Your Friend Fido" width={200} height={80} className="h-20 w-auto" priority />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Tired of reading the news and still not knowing how it affects you?</h1>
          <div className="text-xl text-gray-600 mb-6 max-w-2xl mx-auto">
                         <ul className="space-y-1 text-center">
               <li>• What does this mean for your community?</li>
               <li>• Where do your elected officials stand?</li>
               <li>• How can you give them feedback?</li>
             </ul>
          </div>
          <div className="w-24 h-1 bg-blue-500 mx-auto rounded mb-6"></div>
        </div>

        {/* Main Value Proposition */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Meet Your Friend Fido — the first personalized news and civic engagement service built just for you.</h2>
          <p className="text-xl text-gray-600 mb-6">Fido fetches and customizes the news based on your location, so you can instantly see:</p>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="text-center"><div className="text-4xl mb-2">🏙️</div><p className="text-gray-700">How each issue impacts your city, county, or neighborhood</p></div>
            <div className="text-center"><div className="text-4xl mb-2">🏛️</div><p className="text-gray-700">Where your elected officials stand</p></div>
            <div className="text-center"><div className="text-4xl mb-2">📨</div><p className="text-gray-700">How to contact them directly with one click</p></div>
          </div>
        </div>

        {/* Call to Action with Embedded Form */}
        <div className="grid md:grid-cols-2 gap-8 mb-6">
          <div className="flex items-center">
            <div className="text-center md:text-left">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Reclaim your power. Rediscover your democracy.</h2>
              <p className="text-xl text-gray-600 mb-6">Sign up today and join the movement to bring journalism and civic engagement into the 21st century.</p>
            </div>
          </div>
          <div><SignupForm /></div>
        </div>

        {/* Secondary CTA - Learn More */}
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">For Journalists & Organizations</h2>
          <p className="text-gray-600 mb-4">Want to deliver personalized civic updates to your audience? We can help you reach people with content that matters to their community.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="mailto:kevin@myrepresentatives.com" className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Contact Us
            </a>
            <Link href="/admin/login" className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1 1 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Admin Access
            </Link>
          </div>
        </div>

        {/* Status */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
            YFF Platform - Ready for Production
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  )
}
