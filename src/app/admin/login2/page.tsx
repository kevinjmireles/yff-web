/**
 * Admin Login Test Page (Server Component)
 * 
 * Purpose: Test page to verify dynamic rendering works
 * Security: Forces dynamic rendering to prevent static prerendering
 */

// Force dynamic rendering - these exports must be in a server component
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'default-no-store';

export default function AdminLoginTestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Admin Login Test
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            This page should NOT be prerendered (no x-nextjs-prerender header)
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-sm text-gray-600 mb-4">
            If you see this page without the x-nextjs-prerender header, 
            the dynamic rendering fix is working.
          </p>
          <a
            href="/admin/login"
            className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Real Login
          </a>
        </div>
      </div>
    </div>
  );
}
