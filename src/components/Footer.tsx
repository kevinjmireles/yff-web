// Purpose: Footer component with privacy policy and terms links.
// Called by: Homepage and other pages for consistent footer.
// Note: Privacy and terms pages are placeholders for now.

import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-lg font-semibold mb-4">Your Friend Fido</h4>
            <p className="text-gray-300">
              Bringing journalism and civic engagement into the 21st century.
            </p>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-gray-300">
              <li><a href="#about" className="hover:text-white transition-colors">About</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#contact" className="hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-gray-300">
              <li><Link href="/preferences" className="hover:text-white transition-colors">Preferences</Link></li>
              <li><Link href="/unsubscribe" className="hover:text-white transition-colors">Unsubscribe</Link></li>
              <li><a href="#help" className="hover:text-white transition-colors">Help</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-gray-300">
              <li><Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><a href="#accessibility" className="hover:text-white transition-colors">Accessibility</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-300">
          <p>&copy; 2025 Cut CO2 LLC. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
