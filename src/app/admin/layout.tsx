/**
 * Admin Layout
 * 
 * Purpose: Admin section layout with dynamic rendering
 * Security: Forces dynamic rendering to prevent ISR prerendering
 */

// Force dynamic rendering for all admin pages
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'default-no-store';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>
              <div className="flex gap-4">
                <a
                  href="/admin/content"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Content Import
                </a>
                <a
                  href="/admin/send"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Send
                </a>
              </div>
            </div>
            <div className="flex items-center">
              <a
                href="/admin/login"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Login
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
