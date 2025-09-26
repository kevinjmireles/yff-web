// Purpose: Centralized error helpers to enforce beginner-friendly logging.

export function logError(msg: string, error: unknown) {
  console.error(`${msg}`, error)
}

export function toUserMessage(defaultMsg = 'Something went wrong') {
  // Smallest safe mapping for UI surfaces.
  return defaultMsg
}

/**
 * Detects a Postgres unique constraint violation (code 23505).
 * Works with Supabase error objects and plain objects.
 * Optionally match a specific constraint name.
 */
export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  const anyErr = error as { code?: string; message?: string; details?: string; hint?: string; name?: string } | undefined
  if (!anyErr) return false
  const is23505 = anyErr.code === '23505' || /unique constraint/i.test(anyErr.message ?? '')
  if (!is23505) return false
  if (!constraintName) return true
  const inMessage = (anyErr.message ?? '').includes(constraintName)
  const inDetails = (anyErr.details ?? '').includes(constraintName)
  const inHint = (anyErr.hint ?? '').includes(constraintName)
  return inMessage || inDetails || inHint
}
