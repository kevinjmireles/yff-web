/**
 * Feature Flags for V2.1 Functionality
 * 
 * Purpose: Control access to new features in production
 * Default: All features ON (current behavior) but controllable via environment
 */

export const features = {
  // Admin functionality
  adminSend: process.env.FEATURE_ADMIN_SEND !== '0', // Default ON
  adminAuth: process.env.FEATURE_ADMIN_AUTH !== '0', // Default ON
  
  // Send functionality
  sendRun: process.env.FEATURE_SEND_RUN !== '0', // Default ON
  sendPreview: process.env.FEATURE_SEND_PREVIEW !== '0', // Default ON
  
  // Content functionality
  contentPromote: process.env.FEATURE_CONTENT_PROMOTE !== '0', // Default ON
  
  // Development flags
  debugMode: process.env.NODE_ENV === 'development',
  verboseLogging: process.env.VERBOSE_LOGGING === '1',
} as const;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof features): boolean {
  return features[feature];
}

/**
 * Get feature status for debugging
 */
export function getFeatureStatus() {
  return Object.entries(features).reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, boolean>);
}

// Send execution flags (MVP)
export const FEATURE_SEND_EXECUTE =
  process.env.FEATURE_SEND_EXECUTE !== '0';
export const FEATURE_TEST_SEND =
  process.env.FEATURE_TEST_SEND === 'on';
export const FEATURE_FULL_SEND =
  process.env.FEATURE_FULL_SEND === 'on';
export const MAX_SEND_PER_RUN =
  parseInt(process.env.MAX_SEND_PER_RUN ?? '100');