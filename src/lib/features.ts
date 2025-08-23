// Purpose: Feature flag helpers from env.
// Called by: any WIP feature surfaces.

type Flag = 'FEATURE_DELEGATION_TOKENS' | 'FEATURE_ADMIN_IMPORTS'

export function isFeatureEnabled(flag: Flag): boolean {
  return String(process.env[flag]).toLowerCase() === 'true'
}
