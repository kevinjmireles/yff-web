/* eslint-disable react/no-unescaped-entities */
// Purpose: Privacy Policy page for legal compliance.
// Called by: Footer component and direct navigation.
// Note: MVP version with essential privacy information.

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <article className="prose prose-lg max-w-none">
            <h1 className="text-4xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
            <p className="text-gray-600 mb-6">Effective Date: January 1, 2025</p>

            <p className="mb-6">
              Your Friend Fido ("YFF," "we," "us," or "our") is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, and share information when you interact 
              with our website, services, and communications.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Information you provide (name, email, address, zipcode).</li>
              <li>Usage information (log data, IP address, browser).</li>
              <li>Email interaction data (delivery, opens, clicks, unsubscribes, bounces).</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">2. How We Use Information</h2>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Deliver newsletters and civic updates.</li>
              <li>Personalize content based on your preferences.</li>
              <li>Maintain security and integrity.</li>
              <li>Comply with legal obligations.</li>
            </ul>
            <p className="mb-6 font-semibold">We will never sell your personal information.</p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">3. How We Share Information</h2>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>With service providers (Supabase, SendGrid, Make.com).</li>
              <li>For legal compliance if required by law.</li>
            </ul>
            <p className="mb-6 font-semibold">We do not share with advertisers.</p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">4. Your Choices</h2>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Unsubscribe anytime via the link in emails.</li>
              <li>Contact us to request access, correction, or deletion.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">5. Data Security</h2>
            <p className="mb-6">
              We use reasonable safeguards but cannot guarantee 100% security.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">6. Children's Privacy</h2>
            <p className="mb-6">
              We do not knowingly collect info from children under 13.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">7. Updates</h2>
            <p className="mb-6">
              We may update this Privacy Policy. Changes will be posted with a new effective date.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">8. Contact</h2>
            <p className="mb-6">
              Questions? Contact: <a href="mailto:info@myrepresentatives.com" className="text-blue-600 hover:text-blue-800">info@myrepresentatives.com</a>
            </p>
          </article>
        </div>
      </div>
    </div>
  )
}
