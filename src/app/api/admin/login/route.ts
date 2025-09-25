/**
 * Admin Login API
 * 
 * Purpose: Handle admin authentication
 * Security: Password verification with secure cookie setting
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminPassword, setAdminCookieJson } from '@/lib/adminAuth';
import { isFeatureEnabled } from '@/lib/features';

const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    // Feature flag check
    if (!isFeatureEnabled('adminAuth')) {
      return NextResponse.json(
        { 
          ok: false, 
          code: 'FEATURE_DISABLED', 
          message: 'Admin authentication is currently disabled' 
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { password } = loginSchema.parse(body);

    // Verify password
    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { 
          ok: false, 
          code: 'INVALID_PASSWORD', 
          message: 'Invalid password' 
        },
        { status: 401 }
      );
    }

    // Set admin cookie and return JSON response
    return setAdminCookieJson();

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          ok: false, 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid input data',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    console.error('Admin login API error:', error);
    return NextResponse.json(
      { 
        ok: false, 
        code: 'INTERNAL_ERROR', 
        message: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
