/**
 * Simple Admin Authentication
 * 
 * Purpose: Basic admin authentication for V2.1 features
 * Security: Password-based with session cookies
 */

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { isFeatureEnabled } from './features';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_COOKIE_NAME = 'yff_admin';
const ADMIN_COOKIE_VALUE = '1';
const COOKIE_MAX_AGE = 8 * 60 * 60; // 8 hours

/**
 * Check if user is authenticated as admin
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD) {
    // If no password set, allow access in development
    return process.env.NODE_ENV === 'development';
  }

  const cookieStore = await cookies();
  const adminCookie = cookieStore.get(ADMIN_COOKIE_NAME);
  return adminCookie?.value === ADMIN_COOKIE_VALUE;
}

/**
 * Verify admin password
 */
export function verifyAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

/**
 * Set admin authentication cookie
 */
export function setAdminCookie(): Response {
  const response = new Response(null, { status: 302 });
  response.headers.set('Location', '/admin/send');
  response.headers.set('Set-Cookie', `${ADMIN_COOKIE_NAME}=${ADMIN_COOKIE_VALUE}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`);
  return response;
}

/**
 * Clear admin authentication cookie
 */
export function clearAdminCookie(): Response {
  const response = new Response(null, { status: 302 });
  response.headers.set('Location', '/admin/login');
  response.headers.set('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  return response;
}

/**
 * Middleware to check admin authentication
 */
export function requireAdminAuth(request: NextRequest): boolean {
  if (!isFeatureEnabled('adminAuth')) {
    return true; // Skip auth if feature is disabled
  }

  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME);
  return adminCookie?.value === ADMIN_COOKIE_VALUE;
}
