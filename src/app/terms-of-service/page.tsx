// Purpose: Terms of Service page for legal compliance.
// Called by: Footer component and direct navigation.
// Note: MVP version with essential terms and liability protection.

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <article className="prose prose-lg max-w-none">
            <h1 className="text-4xl font-bold text-gray-900 mb-8">Terms of Service</h1>
            <p className="text-gray-600 mb-6">Effective Date: January 1, 2025</p>

            <p className="mb-6">
              Welcome to Your Friend Fido ("YFF," "we," "us," or "our"). By using our website and 
              services (the "Services"), you agree to these Terms.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">1. Use of Services</h2>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Use our Services only for lawful purposes.</li>
              <li>You are responsible for providing accurate signup info.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">2. Communications</h2>
            <p className="mb-6">
              By signing up, you consent to receive civic updates. You may unsubscribe at any time.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">3. Intellectual Property</h2>
            <p className="mb-6">
              All content and software related to YFF are the property of <strong>Cut CO2 LLC</strong> and 
              protected by copyright and trademark laws.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">4. Prohibited Conduct</h2>
            <p className="mb-4">Do not:</p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Interfere with security or performance.</li>
              <li>Attempt to access unauthorized data.</li>
              <li>Use our Services to send spam or unlawful content.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">5. Disclaimer of Warranties</h2>
            <p className="mb-4">Our Services are provided "as is" and "as available."</p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>The information we provide is <strong>deemed reliable but not guaranteed</strong>.</li>
              <li>We make <strong>no warranty, express or implied</strong>, regarding the accuracy, completeness, or timeliness of the information.</li>
              <li>To the fullest extent permitted by law, we disclaim all warranties of merchantability, fitness for a particular purpose, and non-infringement.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">6. Limitation of Liability</h2>
            <p className="mb-6">
              To the maximum extent permitted by law, YFF shall not be liable for any indirect, 
              incidental, or consequential damages arising from use of the Services.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">7. Termination</h2>
            <p className="mb-6">
              We may suspend or terminate access to Services for violations of these Terms.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">8. Governing Law</h2>
            <p className="mb-6">
              These Terms are governed by the laws of Ohio.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">9. Updates</h2>
            <p className="mb-6">
              We may update these Terms. Continued use means you accept the updated Terms.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">10. Contact</h2>
            <p className="mb-6">
              Questions? Contact: <a href="mailto:info@myrepresentatives.com" className="text-blue-600 hover:text-blue-800">info@myrepresentatives.com</a>
            </p>
          </article>
        </div>
      </div>
    </div>
  )
}
