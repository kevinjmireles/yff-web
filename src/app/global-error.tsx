'use client'

// Purpose: Global error boundary for Next.js App Router.
// Called by: Next.js when a root-level error occurs.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-red-600 mb-4">🚨</h1>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Critical Error</h2>
            <p className="text-gray-600 mb-8">Something went very wrong. Please try refreshing the page.</p>
            <button
              onClick={reset}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
