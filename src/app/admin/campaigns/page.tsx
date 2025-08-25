// Purpose: Admin page for triggering newsletter campaigns.
// Called by: Admin navigation from homepage.
// Status: Placeholder - will be wired to Make.com webhook later.

export default function AdminCampaignsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Campaign Management</h1>
          <p className="text-xl text-gray-600">Trigger and manage newsletter campaigns</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📢</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Campaign Trigger</h2>
            <p className="text-gray-600 mb-6">
              This page will allow administrators to trigger newsletter campaigns, 
              select target audiences, and monitor delivery status.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-green-800 text-sm">
                <strong>Coming Soon:</strong> Campaign management will be available 
                after we integrate with Make.com for workflow automation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
