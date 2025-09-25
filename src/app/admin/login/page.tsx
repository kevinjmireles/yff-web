/**
 * Admin Login Page (Server Component)
 * 
 * Purpose: Server wrapper for admin authentication with dynamic rendering
 * Security: Forces dynamic rendering to prevent static prerendering
 */

// Force dynamic rendering - these exports must be in a server component
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'default-no-store';

import LoginPageClient from './LoginPageClient';

export default function AdminLoginPage() {
  return <LoginPageClient />;
}