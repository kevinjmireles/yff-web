// Purpose: User preferences page for managing subscription settings.
// Called by: Navigation links from homepage and other pages.
// Status: Placeholder - will be wired to Edge Functions later.

export default function PreferencesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Manage Your Preferences</h1>
          <p className="text-xl text-gray-600">Control how you receive updates from Your Friend Fido</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔧</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Preferences Management</h2>
            <p className="text-gray-600 mb-6">
              This page will allow you to manage your subscription preferences, 
              update your address, and control notification settings.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800 text-sm">
                <strong>Coming Soon:</strong> Full preferences management will be available 
                after we complete the Edge Function integration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
